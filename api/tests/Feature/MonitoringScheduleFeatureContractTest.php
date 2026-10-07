<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * PROTECTED FEATURE-CONTRACT / REGRESSION TESTS.
 *
 * Oracle: Monitoring Register and Visit Calendar Feature Contract, 2026-10-07.
 * These tests protect authoritative schedule semantics that the redesigned UI
 * must consume. They do not prescribe how the UI fetches or renders them.
 */
class MonitoringScheduleFeatureContractTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function createVisit(
        User $reviewer,
        User $assignee,
        string $referenceCode,
        ?string $targetDate,
        array $attributes = [],
    ): Report {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create(array_merge([
            'reference_code' => $referenceCode,
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ], $attributes));

        FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => $targetDate,
        ]);

        return $report;
    }

    public function test_overdue_and_upcoming_use_the_asia_manila_office_day_and_today_is_not_overdue(): void
    {
        // 2026-10-07 16:30 UTC is 2026-10-08 00:30 in Asia/Manila.
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-07T16:30:00Z'));

        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $assignee = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();

        $overdue = $this->createVisit($reviewer, $assignee, 'CG-OFFICE-YESTERDAY', '2026-10-07');
        $today = $this->createVisit($reviewer, $assignee, 'CG-OFFICE-TODAY', '2026-10-08');
        $future = $this->createVisit($reviewer, $assignee, 'CG-OFFICE-TOMORROW', '2026-10-09');
        $completed = $this->createVisit(
            $reviewer,
            $assignee,
            'CG-COMPLETED-OLD-DATE',
            '2026-10-07',
            ['field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED],
        );

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/field-validation-queue?queue='.Report::QUEUE_FOLLOW_UP_DUE)
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.uuid', $overdue->uuid)
            ->assertJsonMissing(['uuid' => $today->uuid])
            ->assertJsonMissing(['uuid' => $completed->uuid]);

        $this->getJson('/api/v1/reports/field-validation-queue?queue='.Report::QUEUE_UPCOMING)
            ->assertOk()
            ->assertJsonPath('data.count', 2)
            ->assertJsonPath('data.items.0.uuid', $today->uuid)
            ->assertJsonPath('data.items.1.uuid', $future->uuid)
            ->assertJsonMissing(['uuid' => $overdue->uuid]);
    }

    public function test_needs_visit_retains_unscheduled_work_while_a_calendar_date_range_returns_only_dated_visits(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $assignee = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();

        $assignedWithoutDate = $this->createVisit(
            $reviewer,
            $assignee,
            'CG-UNSCHEDULED-ASSIGNED',
            null,
        );

        $legacyUnassigned = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-UNSCHEDULED-LEGACY',
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);

        $scheduled = $this->createVisit(
            $reviewer,
            $assignee,
            'CG-SCHEDULED-OCTOBER',
            '2026-10-10',
        );

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/field-validation-queue?queue='.Report::QUEUE_NEEDS_VISIT)
            ->assertOk()
            ->assertJsonPath('data.count', 3)
            ->assertJsonFragment(['uuid' => $assignedWithoutDate->uuid, 'target_visit_date' => null])
            ->assertJsonFragment(['uuid' => $legacyUnassigned->uuid, 'target_visit_date' => null])
            ->assertJsonFragment(['uuid' => $scheduled->uuid, 'target_visit_date' => '2026-10-10']);

        $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
            'queue' => Report::QUEUE_NEEDS_VISIT,
            'due_from' => '2026-10-01',
            'due_to' => '2026-10-31',
        ]))
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.uuid', $scheduled->uuid)
            ->assertJsonMissing(['uuid' => $assignedWithoutDate->uuid])
            ->assertJsonMissing(['uuid' => $legacyUnassigned->uuid]);
    }

    public function test_reschedule_and_unschedule_converge_on_one_authoritative_active_schedule(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $assignee = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $report = $this->createVisit(
            $reviewer,
            $assignee,
            'CG-RESCHEDULE-CONVERGENCE',
            '2026-10-10',
        );

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
            'queue' => Report::QUEUE_NEEDS_VISIT,
            'due_from' => '2026-10-10',
            'due_to' => '2026-10-10',
        ]))
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.uuid', $report->uuid);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $assignee->uuid,
            'field_validation_target_date' => '2026-10-12',
            'correction_reason' => 'Visit moved to the approved field date.',
            'expected_version' => $report->lock_version,
        ])->assertOk();

        $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
            'queue' => Report::QUEUE_NEEDS_VISIT,
            'due_from' => '2026-10-10',
            'due_to' => '2026-10-10',
        ]))
            ->assertOk()
            ->assertJsonPath('data.count', 0);

        $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
            'queue' => Report::QUEUE_NEEDS_VISIT,
            'due_from' => '2026-10-12',
            'due_to' => '2026-10-12',
        ]))
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.uuid', $report->uuid)
            ->assertJsonPath('data.items.0.target_visit_date', '2026-10-12');

        $report->refresh();
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $assignee->uuid,
            'field_validation_target_date' => null,
            'correction_reason' => 'Target date removed pending coordination.',
            'expected_version' => $report->lock_version,
        ])->assertOk();

        $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
            'queue' => Report::QUEUE_NEEDS_VISIT,
            'due_from' => '2026-10-12',
            'due_to' => '2026-10-12',
        ]))
            ->assertOk()
            ->assertJsonPath('data.count', 0);

        $this->getJson('/api/v1/reports/field-validation-queue?queue='.Report::QUEUE_NEEDS_VISIT)
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.uuid', $report->uuid)
            ->assertJsonPath('data.items.0.target_visit_date', null);
    }
}
