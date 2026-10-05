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

    public function test_lifecycle_distributions_cover_operational_states_without_expert_metrics(): void
    {
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'referral_state' => Report::REFERRAL_STATE_REFERRED,
            'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
        ]);

        $data = $this->getAnalytics([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]);

        $this->assertSame(
            ['not_determined' => 1, 'verified' => 0, 'unable_to_verify' => 0],
            $data['lifecycle']['verification_outcome'],
        );
        $this->assertSame(
            ['unassigned' => 0, 'assigned' => 1, 'in_progress' => 0, 'completed' => 0],
            $data['lifecycle']['field_validation_state'],
        );
        $this->assertArrayNotHasKey('referral_state', $data['lifecycle']);
        $this->assertArrayNotHasKey('expert_verification', $data);
    }

    public function test_area_reports_provenance_split_and_excluded_duplicates(): void
    {
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'affected_area_hectares' => 10.0,
            'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
            'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'affected_area_hectares' => 4.5,
            'affected_area_measurement' => Report::MEASUREMENT_NOT_MEASURED,
            'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'affected_area_hectares' => null,
            'submitted_at' => CarbonImmutable::parse('2026-09-03T03:00:00Z'),
        ]);
        $canonical = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'affected_area_hectares' => 7.0,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T02:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'affected_area_hectares' => 99.0,
            'canonical_report_id' => $canonical->getKey(),
            'submitted_at' => CarbonImmutable::parse('2026-09-04T03:00:00Z'),
        ]);

        $data = $this->getAnalytics([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]);

        $this->assertEquals(21.5, $data['area']['estimated_hectares']);
        $this->assertSame(3, $data['area']['contributing_reports']);
        // The canonical report itself is a submitted report; only its linked
        // duplicate stays out of the sum.
        $this->assertSame(2, $data['area']['measured_reports']);
        $this->assertEquals(17.0, $data['area']['measured_hectares']);
        $this->assertSame(1, $data['area']['not_measured_reports']);
        $this->assertEquals(4.5, $data['area']['not_measured_hectares']);
        $this->assertSame(1, $data['area']['linked_duplicates_excluded']);
        $this->assertSame(
            'Estimates may overlap where submitted reports describe the same ground.',
            $data['area']['overlap_note'],
        );
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

    public function test_schedule_reports_four_buckets_with_unscheduled_visible(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $today = CarbonImmutable::now('Asia/Manila')->toDateString();

        $past = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $past->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2026-01-05',
        ]);
        $dueToday = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
            'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z'),
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $dueToday->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => $today,
        ]);
        $scheduled = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T02:00:00Z'),
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $scheduled->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2099-01-05',
        ]);
        // No assignment at all: unscheduled, never past-due.
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'submitted_at' => CarbonImmutable::parse('2026-09-05T02:00:00Z'),
        ]);
        // Completed validation is out of the schedule picture.
        $done = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
            'submitted_at' => CarbonImmutable::parse('2026-09-05T03:00:00Z'),
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $done->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2026-01-05',
        ]);

        $data = $this->getAnalytics([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]);

        $this->assertSame(1, $data['validation_schedule']['unscheduled']);
        $this->assertSame(1, $data['validation_schedule']['scheduled']);
        $this->assertSame(1, $data['validation_schedule']['due_today']);
        $this->assertSame(1, $data['validation_schedule']['past_target_date']);
        $this->assertSame($today, $data['validation_schedule']['today']);
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

        $this->assertSame(0, $data['area']['contributing_reports']);
        $this->assertEquals(0.0, $data['area']['estimated_hectares']);
        $this->assertSame(0, $data['area']['linked_duplicates_excluded']);
        $this->assertSame([], $data['validation_workload']['assignees']);
        $this->assertSame(0, $data['validation_workload']['unassigned']);
        $this->assertSame(
            ['unscheduled' => 0, 'scheduled' => 0, 'due_today' => 0, 'past_target_date' => 0],
            collect($data['validation_schedule'])->except('today')->all(),
        );
        $this->assertSame(0, $data['review_backlog']['total_waiting']);
        $this->assertNull($data['review_backlog']['oldest_waiting_days']);
        $this->assertSame(0, $data['validation_turnaround']['completed']);
    }
}
