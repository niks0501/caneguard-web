<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportAnalyticsPhase2Test extends TestCase
{
    use RefreshDatabase;

    private function getAnalytics(array $query): array
    {
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());

        return $this->getJson('/api/v1/reports/analytics?'.http_build_query($query))
            ->assertOk()
            ->json('data');
    }

    public function test_slices_the_trends_tab_does_not_render_are_not_computed(): void
    {
        $data = $this->getAnalytics([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]);

        foreach (['cases_by_barangay', 'cases_by_possible_condition', 'case_state', 'lifecycle', 'area', 'validation_schedule'] as $slice) {
            $this->assertArrayNotHasKey($slice, $data);
        }
    }

    public function test_workload_groups_open_validation_by_assignee_with_unassigned_bucket(): void
    {
        $anna = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create(['name' => 'Anna Validator']);
        $ben = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create(['name' => 'Ben Validator']);
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();

        $assigned = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $assigned->getKey(),
            'assignee_id' => $ben->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        $progress = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z'),
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $progress->getKey(),
            'assignee_id' => $anna->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        // Legacy unassigned row routed for field validation: visible work, no assignee.
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T02:00:00Z'),
        ]);
        // Closed reports are not open work.
        $closed = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_CLOSED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T03:00:00Z'),
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $closed->getKey(),
            'assignee_id' => $anna->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);

        $data = $this->getAnalytics([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]);

        // Alphabetical by name, never ranked: Anna before Ben.
        $this->assertSame(
            [
                ['assignee_id' => $anna->getKey(), 'name' => 'Anna Validator', 'open_reports' => 1],
                ['assignee_id' => $ben->getKey(), 'name' => 'Ben Validator', 'open_reports' => 1],
            ],
            $data['validation_workload']['assignees'],
        );
        $this->assertSame(1, $data['validation_workload']['unassigned']);
    }

    public function test_backlog_buckets_waiting_age_and_names_the_oldest_wait(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-09-07T02:00:00Z'));

        $oldSubmittedAt = CarbonImmutable::parse('2026-06-15T02:00:00Z');
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            // Long wait: lands in the 30+ bucket and sets the oldest wait.
            'submitted_at' => $oldSubmittedAt,
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'submitted_at' => CarbonImmutable::parse('2026-09-05T02:00:00Z'),
        ]);
        // Verified reports are not waiting for a first review.
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'submitted_at' => CarbonImmutable::parse('2026-09-05T03:00:00Z'),
        ]);

        $data = $this->getAnalytics([
            'from' => '2026-06-01',
            'to' => '2026-09-07',
            'granularity' => 'week',
        ]);

        $this->assertSame(2, $data['review_backlog']['total_waiting']);
        // Only the June report has waited longer than the 3-day review target.
        $this->assertSame(3, $data['review_backlog']['target_days']);
        $this->assertSame(1, $data['review_backlog']['past_target']);
        $this->assertSame(
            (int) $oldSubmittedAt->diffInDays(CarbonImmutable::now('Asia/Manila')),
            $data['review_backlog']['oldest_waiting_days'],
        );
        $buckets = collect($data['review_backlog']['buckets']);
        $this->assertSame(1, $buckets->firstWhere('label', '30+ days waiting')['count']);
        $this->assertSame(2, $buckets->sum('count'));
    }

    public function test_turnaround_reports_measured_durations_and_skips_negative_intervals(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'activated_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z'),
        ]);
        FieldValidationCompletion::factory()->create([
            'assignment_id' => $assignment->getKey(),
            'visited_at' => CarbonImmutable::parse('2026-09-04T02:00:00Z'),
        ]);
        // Inconsistent clock order: never presented as a duration.
        $bad = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'submitted_at' => CarbonImmutable::parse('2026-09-02T03:00:00Z'),
        ]);
        $badAssignment = FieldValidationAssignment::factory()->create([
            'report_id' => $bad->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'activated_at' => CarbonImmutable::parse('2026-09-05T02:00:00Z'),
        ]);
        FieldValidationCompletion::factory()->create([
            'assignment_id' => $badAssignment->getKey(),
            'visited_at' => CarbonImmutable::parse('2026-09-04T02:00:00Z'),
        ]);

        $data = $this->getAnalytics([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]);

        $this->assertSame('activated_at_to_visited_at', $data['validation_turnaround']['source']);
        $this->assertSame(1, $data['validation_turnaround']['completed']);
        $this->assertSame(7, $data['validation_turnaround']['target_days']);
        $this->assertSame(1, $data['validation_turnaround']['within_target']);
        $this->assertEquals(24.0, $data['validation_turnaround']['average_hours']);
        $this->assertEquals(24.0, $data['validation_turnaround']['median_hours']);
        $this->assertEquals(24.0, $data['validation_turnaround']['min_hours']);
        $this->assertEquals(24.0, $data['validation_turnaround']['max_hours']);
        $this->assertSame(1, collect($data['validation_turnaround']['buckets'])->firstWhere('label', '1–3 days')['count']);
    }

    public function test_phase2_blocks_return_empty_shapes_for_a_quiet_period(): void
    {
        $data = $this->getAnalytics([
            'from' => '2026-09-01',
            'to' => '2026-09-02',
            'granularity' => 'day',
        ]);

        $this->assertSame([], $data['validation_workload']['assignees']);
        $this->assertSame(0, $data['validation_workload']['unassigned']);
        $this->assertSame(0, $data['review_backlog']['total_waiting']);
        $this->assertNull($data['review_backlog']['oldest_waiting_days']);
        $this->assertSame(0, $data['validation_turnaround']['completed']);
        $this->assertSame(0, $data['validation_turnaround']['within_target']);
        $this->assertSame(0, $data['review_backlog']['past_target']);
        $this->assertSame(0, $data['review_time']['current']['reviewed_cases']);
        $this->assertNull($data['review_time']['current']['median_hours']);
        $this->assertSame(0, $data['review_time']['previous']['reviewed_cases']);
    }

    public function test_review_time_compares_the_median_with_the_previous_window(): void
    {
        // Current window (1-7 Sep): reviewed after 24h and 72h, median 48h.
        foreach ([['2026-09-02T02:00:00Z', 24], ['2026-09-03T02:00:00Z', 72]] as [$submitted, $hours]) {
            $at = CarbonImmutable::parse($submitted);
            Report::factory()->inDistrict($this->pilotDistrict())->create([
                'submitted_at' => $at,
                'reviewed_at' => $at->addHours($hours),
            ]);
        }
        // Previous window (25-31 Aug): one report reviewed after 96h.
        $previous = CarbonImmutable::parse('2026-08-27T02:00:00Z');
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'submitted_at' => $previous,
            'reviewed_at' => $previous->addHours(96),
        ]);

        $data = $this->getAnalytics([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]);

        $this->assertSame(3, $data['review_time']['target_days']);
        $this->assertSame(2, $data['review_time']['current']['reviewed_cases']);
        $this->assertEquals(48.0, $data['review_time']['current']['median_hours']);
        $this->assertSame(1, $data['review_time']['previous']['reviewed_cases']);
        $this->assertEquals(96.0, $data['review_time']['previous']['median_hours']);
    }
}
