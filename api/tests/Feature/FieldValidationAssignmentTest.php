<?php

namespace Tests\Feature;

use App\Contracts\MobileFieldValidationAssignmentContract;
use App\Contracts\MobileFieldValidationCompletionContract;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FieldValidationAssignmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_mobile_assignment_feed_requires_a_field_reporter_session(): void
    {
        $this->getJson('/api/v1/mobile/assignments')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->reviewer()->create(), ['assignment:read']);
        $this->getJson('/api/v1/mobile/assignments')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_selecting_field_validation_requires_an_assignee_and_target_date_is_optional(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('field_validation_assignee_uuid');

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $report->reporter->uuid,
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.lifecycle.field_validation_state', Report::FIELD_VALIDATION_STATE_ASSIGNED)
            ->assertJsonPath('data.field_validation_assignment.target_visit_date', null);

        $assignment = FieldValidationAssignment::query()->firstOrFail();
        $this->assertNull($assignment->target_visit_date);
        $this->assertSame(Report::STATUS_FOR_FIELD_VALIDATION, $report->fresh()->review_status);
    }

    public function test_legacy_field_validation_selection_also_requires_an_assignee(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('field_validation_assignee_uuid');
    }

    public function test_assignment_cannot_be_combined_with_closing_the_case(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $report->reporter->uuid,
            'case_state' => Report::CASE_STATE_CLOSED,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('field_validation_state');
        $this->assertDatabaseCount('field_validation_assignments', 0);
    }

    public function test_only_field_reporters_are_eligible_and_web_list_is_role_scoped(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $otherReviewer = User::factory()->reviewer()->create();
        $fieldReporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create();
        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/field-reporters')
            ->assertOk()
            ->assertJsonFragment(['uuid' => $fieldReporter->uuid])
            ->assertJsonMissing(['uuid' => $otherReviewer->uuid]);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $otherReviewer->uuid,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('field_validation_assignee_uuid');

        $fieldReporterToken = $fieldReporter->createToken(
            'field-reporter-list',
            ['assignment:read'],
        )->plainTextToken;
        Auth::forgetGuards();
        $this->withToken($fieldReporterToken)
            ->getJson('/api/v1/field-reporters')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_assignment_is_immediate_and_same_submitter_relationship_is_visible(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $submitter = User::factory()->fieldReporter()->create(['name' => 'Original Submitter']);
        $report = Report::factory()->create(['reporter_id' => $submitter]);
        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $submitter->uuid,
            'field_validation_target_date' => '2026-09-01',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.lifecycle.field_validation_state', Report::FIELD_VALIDATION_STATE_ASSIGNED)
            ->assertJsonPath('data.field_validation_assignment.assignee.uuid', $submitter->uuid)
            ->assertJsonPath('data.field_validation_assignment.target_visit_date', '2026-09-01');

        Sanctum::actingAs($submitter, ['assignment:read']);
        $response = $this->getJson('/api/v1/mobile/assignments')
            ->assertOk()
            ->assertJsonPath('data.0.report_uuid', $report->uuid)
            ->assertJsonPath('data.0.submitter_is_assignee', true)
            ->assertJsonPath('data.0.field_validation_state', Report::FIELD_VALIDATION_STATE_ASSIGNED)
            ->assertJsonPath('data.0.target_visit_date', '2026-09-01')
            ->assertJsonStructure(['data', 'links', 'meta', 'sync' => ['before']]);
        $this->assertSame(
            array_keys(MobileFieldValidationAssignmentContract::definition()['fields']),
            array_keys($response->json('data.0')),
        );
        $this->assertSame(
            MobileFieldValidationAssignmentContract::definition()['fields']['case']['required_keys'],
            array_keys($response->json('data.0.case')),
        );

        $this->assertDatabaseHas('field_validation_assignments', [
            'report_id' => $report->getKey(),
            'assignee_id' => $submitter->getKey(),
        ]);
    }

    public function test_rescheduling_a_target_date_writes_a_report_audit(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2026-09-01',
        ]);
        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $assignee->uuid,
            'field_validation_target_date' => '2026-09-08',
            'correction_reason' => 'The field officer requested a safer visit window.',
            'expected_version' => $report->lock_version,
        ])
            ->assertOk()
            ->assertJsonPath('data.audit.metadata_corrections.0.field', 'field_validation_target_date')
            ->assertJsonPath('data.audit.metadata_corrections.0.original_value', '2026-09-01')
            ->assertJsonPath('data.audit.metadata_corrections.0.corrected_value', '2026-09-08')
            ->assertJsonPath('data.audit.metadata_corrections.0.reason', 'The field officer requested a safer visit window.');

        $this->assertDatabaseHas('report_audits', [
            'report_id' => $report->getKey(),
            'field' => 'field_validation_target_date',
            'original_value' => json_encode('2026-09-01'),
            'corrected_value' => json_encode('2026-09-08'),
            'reason' => 'The field officer requested a safer visit window.',
            'actor_id' => $reviewer->getKey(),
        ]);
        $this->assertSame('2026-09-08', $assignment->fresh()->target_visit_date?->format('Y-m-d'));
    }

    public function test_mobile_assignment_feed_preserves_smut_model_labels(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->mobileModelV1()->create([
            'predicted_label' => Report::LABEL_SMUT,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);

        Sanctum::actingAs($assignee, ['assignment:read']);

        $this->getJson('/api/v1/mobile/assignments')
            ->assertOk()
            ->assertJsonPath('data.0.case.predicted_label', Report::LABEL_SMUT);
    }

    public function test_mobile_assignment_feed_is_owner_scoped_and_can_materialize_a_server_only_case(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $submitter = User::factory()->fieldReporter()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $otherAssignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'reporter_id' => $submitter,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => null,
        ]);
        $otherReport = Report::factory()->create([
            'reporter_id' => $submitter,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $otherReport->getKey(),
            'assignee_id' => $otherAssignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);

        Sanctum::actingAs($assignee, ['assignment:read']);
        $this->getJson('/api/v1/mobile/assignments')
            ->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.report_uuid', $report->uuid)
            ->assertJsonPath('data.0.submitter.uuid', $submitter->uuid)
            ->assertJsonPath('data.0.assignee.uuid', $assignee->uuid)
            ->assertJsonPath('data.0.reference_code', $report->reference_code);

        Sanctum::actingAs($assignee, ['report:submit']);
        $this->getJson('/api/v1/mobile/assignments')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_mobile_assignment_feed_uses_authenticated_owner_and_stable_cursor_checkpoint(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $reports = Report::factory()->count(3)->create([
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        foreach ($reports as $report) {
            FieldValidationAssignment::factory()->create([
                'report_id' => $report->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
            ]);
        }
        $tiedTimestamp = now()->subMinute()->startOfSecond();
        DB::table('field_validation_assignments')->update(['updated_at' => $tiedTimestamp]);
        Sanctum::actingAs($assignee, ['assignment:read']);

        $first = $this->getJson('/api/v1/mobile/assignments?per_page=2')
            ->assertOk()
            ->assertJsonCount(2, 'data');
        $nextUrl = $first->json('links.next');
        $this->assertNotNull($nextUrl);
        $nextPath = parse_url($nextUrl, PHP_URL_PATH).'?'.parse_url($nextUrl, PHP_URL_QUERY);
        $this->getJson($nextPath)
            ->assertOk()
            ->assertJsonPath('sync.before', $first->json('sync.before'));

        $other = User::factory()->fieldReporter()->create();
        Sanctum::actingAs($other, ['assignment:read']);
        $this->getJson('/api/v1/mobile/assignments')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_reviewer_can_clear_an_assignment_with_an_explicit_null_assignee(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);

        Sanctum::actingAs($reviewer);
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'field_validation_assignee_uuid' => null,
            'expected_version' => 0,
        ])->assertOk()
            ->assertJsonPath(
                'data.lifecycle.field_validation_state',
                Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            );

        $this->assertDatabaseMissing('field_validation_assignments', [
            'id' => $assignment->getKey(),
        ]);
    }

    public function test_completed_validation_evidence_cannot_be_reassigned_or_removed(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        $completion = FieldValidationCompletion::factory()->create([
            'assignment_id' => $assignment->getKey(),
        ]);

        Sanctum::actingAs($reviewer);
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'field_validation_assignee_uuid' => null,
            'expected_version' => 0,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('field_validation_state');

        $this->assertDatabaseHas('field_validation_assignments', [
            'id' => $assignment->getKey(),
        ]);
        $this->assertDatabaseHas('field_validation_completions', [
            'id' => $completion->getKey(),
        ]);
    }

    public function test_field_reporter_can_complete_an_assignment_and_the_case_returns_to_review(): void
    {
        Storage::fake('local');
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'reporter_id' => User::factory()->fieldReporter()->create()->getKey(),
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        $clientUuid = fake()->uuid();
        $payload = [
            'client_uuid' => $clientUuid,
            'field_observation' => 'Fresh observation from the assigned visit.',
            'field_finding' => 'The field finding is preserved as separate evidence.',
            'action_taken' => 'Provided field guidance and recorded the next action.',
            'visited_at' => '2026-09-02T04:05:06.123Z',
            'gps_outcome' => 'low_accuracy',
            'gps_attempted_at' => '2026-09-02T04:05:01.123Z',
            'gps_latitude' => 14.0667,
            'gps_longitude' => 120.6319,
            'gps_accuracy' => 38,
        ];

        Sanctum::actingAs($assignee, ['assignment:complete']);
        $response = $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", $payload);

        $response
            ->assertCreated()
            ->assertJsonPath('data.completion.client_uuid', $clientUuid)
            ->assertJsonPath('data.completion.field_observation', $payload['field_observation'])
            ->assertJsonPath('data.completion.gps.outcome', 'low_accuracy')
            ->assertJsonPath('data.assignment.field_validation_state', Report::FIELD_VALIDATION_STATE_COMPLETED)
            ->assertJsonPath('data.case.case_state', Report::CASE_STATE_OPEN)
            ->assertJsonPath('data.case.verification_outcome', Report::VERIFICATION_OUTCOME_NOT_DETERMINED);

        $this->assertDatabaseHas('field_validation_completions', [
            'assignment_id' => $assignment->getKey(),
            'client_uuid' => $clientUuid,
            'field_finding' => $payload['field_finding'],
            'action_taken' => $payload['action_taken'],
            'gps_outcome' => 'low_accuracy',
        ]);
        $this->assertSame(
            Report::FIELD_VALIDATION_STATE_COMPLETED,
            $report->fresh()->field_validation_state,
        );
        $this->assertSame(Report::CASE_STATE_OPEN, $report->fresh()->case_state);
        $this->assertSame(
            Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            $report->fresh()->verification_outcome,
        );

        $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", $payload)
            ->assertOk()
            ->assertJsonPath('data.completion.client_uuid', $clientUuid);
        $this->assertDatabaseCount('field_validation_completions', 1);

        Sanctum::actingAs($reviewer);
        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.field_validation_assignment.completion.field_finding', $payload['field_finding'])
            ->assertJsonPath('data.lifecycle.field_validation_state', Report::FIELD_VALIDATION_STATE_COMPLETED)
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_OPEN)
            ->assertJsonPath('data.lifecycle.verification_outcome', Report::VERIFICATION_OUTCOME_NOT_DETERMINED);
    }

    public function test_completion_conflict_echoes_the_submitted_client_uuid(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        $conflictingClientUuid = fake()->uuid();
        FieldValidationCompletion::factory()->create([
            'assignment_id' => $assignment->getKey(),
            'client_uuid' => $conflictingClientUuid,
        ]);
        $submittedClientUuid = fake()->uuid();
        $payload = [
            'client_uuid' => $submittedClientUuid,
            'field_observation' => 'Observation from the conflicting retry.',
            'field_finding' => 'Finding from the conflicting retry.',
            'action_taken' => 'Action from the conflicting retry.',
            'visited_at' => '2026-09-02T04:05:06.123Z',
            'gps_outcome' => 'unavailable',
            'gps_attempted_at' => '2026-09-02T04:05:01.123Z',
        ];

        Sanctum::actingAs($assignee, ['assignment:complete']);
        $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", $payload)
            ->assertConflict()
            ->assertJsonPath('code', 'CONFLICT')
            ->assertJsonPath('client_uuid', $submittedClientUuid);

        $this->assertDatabaseHas('field_validation_completions', [
            'assignment_id' => $assignment->getKey(),
            'client_uuid' => $conflictingClientUuid,
        ]);
    }

    public function test_follow_up_outcome_round_trips_supported_values_and_rejects_unknown_values(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        Sanctum::actingAs($assignee, ['assignment:complete']);

        foreach (['improved', 'unchanged', 'worsened', 'unable_to_determine'] as $outcome) {
            $report = Report::factory()->create([
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            ]);
            $assignment = FieldValidationAssignment::factory()->create([
                'report_id' => $report->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
            ]);
            $payload = [
                'client_uuid' => fake()->uuid(),
                'field_observation' => 'Observation for '.$outcome,
                'field_finding' => 'Finding for '.$outcome,
                'action_taken' => 'Action for '.$outcome,
                'follow_up_outcome' => $outcome,
                'visited_at' => '2026-09-02T04:05:06.123Z',
                'gps_outcome' => 'unavailable',
                'gps_attempted_at' => '2026-09-02T04:05:01.123Z',
            ];

            $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", $payload)
                ->assertCreated()
                ->assertJsonPath('data.completion.follow_up_outcome', $outcome);
            $this->assertDatabaseHas('field_validation_completions', [
                'assignment_id' => $assignment->getKey(),
                'follow_up_outcome' => $outcome,
            ]);
        }

        $invalidReport = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $invalidAssignment = FieldValidationAssignment::factory()->create([
            'report_id' => $invalidReport->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);

        $this->post("/api/v1/mobile/assignments/{$invalidAssignment->uuid}/completion", [
            'client_uuid' => fake()->uuid(),
            'field_observation' => 'Observation',
            'field_finding' => 'Finding',
            'action_taken' => 'Action',
            'follow_up_outcome' => 'pending',
            'visited_at' => '2026-09-02T04:05:06.123Z',
            'gps_outcome' => 'unavailable',
            'gps_attempted_at' => '2026-09-02T04:05:01.123Z',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('follow_up_outcome');
    }

    public function test_completion_requires_assignment_ownership_and_completion_ability(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $other = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        $payload = [
            'client_uuid' => fake()->uuid(),
            'field_observation' => 'Observation',
            'field_finding' => 'Finding',
            'action_taken' => 'Action',
            'visited_at' => '2026-09-02T04:05:06.123Z',
            'gps_outcome' => 'permission_denied',
            'gps_attempted_at' => '2026-09-02T04:05:01.123Z',
        ];

        Sanctum::actingAs($other, ['assignment:complete']);
        $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", $payload)
            ->assertForbidden();

        Sanctum::actingAs($assignee, ['assignment:read']);
        $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", $payload)
            ->assertForbidden();
        $this->assertDatabaseCount('field_validation_completions', 0);
    }

    public function test_completion_rejects_impossible_iso_calendar_dates(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);

        Sanctum::actingAs($assignee, ['assignment:complete']);
        $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", [
            'client_uuid' => fake()->uuid(),
            'field_observation' => 'Observation',
            'field_finding' => 'Finding',
            'action_taken' => 'Action',
            'visited_at' => '2026-02-30T04:05:06.123Z',
            'gps_outcome' => 'unavailable',
            'gps_attempted_at' => '2026-02-28T04:05:01.123Z',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('visited_at');

        $this->assertDatabaseCount('field_validation_completions', 0);
    }

    public function test_completion_requires_all_field_evidence_but_allows_an_unavailable_gps_attempt_and_no_photo(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        Sanctum::actingAs($assignee, ['assignment:complete']);
        $base = [
            'client_uuid' => fake()->uuid(),
            'visited_at' => '2026-09-02T04:05:06.123Z',
            'gps_outcome' => 'unavailable',
            'gps_attempted_at' => '2026-09-02T04:05:01.123Z',
        ];

        $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", $base)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['field_observation', 'field_finding', 'action_taken']);

        $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", [
            ...$base,
            'field_observation' => 'Observation',
            'field_finding' => 'Finding',
            'action_taken' => 'Action',
        ])
            ->assertCreated()
            ->assertJsonPath('data.completion.fresh_photo.available', false)
            ->assertJsonPath('data.completion.gps.outcome', 'unavailable');
    }

    public function test_completion_accepts_a_fresh_photo_and_contract_matches_the_route(): void
    {
        Storage::fake('local');
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        Sanctum::actingAs($assignee, ['assignment:complete']);

        $response = $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", [
            'client_uuid' => fake()->uuid(),
            'field_observation' => 'Observation with a fresh photo.',
            'field_finding' => 'Finding',
            'action_taken' => 'Action',
            'visited_at' => '2026-09-02T04:05:06.123Z',
            'gps_outcome' => 'permission_denied',
            'gps_attempted_at' => '2026-09-02T04:05:01.123Z',
            'fresh_photo' => UploadedFile::fake()->image('validation.jpg', 1, 1),
        ]);

        $response->assertCreated()->assertJsonPath('data.completion.fresh_photo.available', true);
        $this->assertDatabaseHas('field_validation_completions', [
            'assignment_id' => $assignment->getKey(),
            'fresh_photo_mime_type' => 'image/jpeg',
        ]);
        Storage::disk('local')->assertExists(
            FieldValidationAssignment::query()->findOrFail($assignment->getKey())->completion->fresh_photo_path,
        );

        $contract = MobileFieldValidationCompletionContract::definition();
        $this->assertSame('POST', $contract['wire']['method']);
        $this->assertSame('/api/v1/mobile/assignments/{assignment}/completion', $contract['wire']['path']);
        $this->assertSame(
            ['client_uuid', 'field_observation', 'field_finding', 'action_taken', 'follow_up_outcome', 'visited_at', 'gps_outcome', 'gps_attempted_at', 'gps_latitude', 'gps_longitude', 'gps_accuracy', 'fresh_photo'],
            array_keys($contract['fields']),
        );
    }

    public function test_mobile_assignment_feed_includes_previous_visit_context_for_the_same_farm(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $previousReport = Report::factory()->create([
            'barangay' => 'Mabini',
            'farmer_or_farm_owner_name' => 'Farm Alpha',
            'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RSSI,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $previousAssignment = FieldValidationAssignment::factory()->create([
            'report_id' => $previousReport->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        $previousCompletion = FieldValidationCompletion::factory()->create([
            'assignment_id' => $previousAssignment->getKey(),
            'field_observation' => 'Previous observation',
            'field_finding' => 'Previous finding',
            'follow_up_outcome' => 'worsened',
            'action_taken' => 'Previous action',
            'visited_at' => '2026-09-10T08:30:00.000Z',
            'fresh_photo_path' => 'field-validation/previous/photo.jpg',
        ]);
        $currentReport = Report::factory()->create([
            'barangay' => ' mabini ',
            'farmer_or_farm_owner_name' => '  FARM   ALPHA  ',
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $currentAssignment = FieldValidationAssignment::factory()->create([
            'report_id' => $currentReport->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);

        Sanctum::actingAs($assignee, ['assignment:read']);
        $response = $this->getJson('/api/v1/mobile/assignments')->assertOk();
        $current = collect($response->json('data'))->firstWhere('report_uuid', $currentReport->uuid);

        $this->assertNotNull($current);
        $this->assertSame([
            'reference_code' => $previousReport->reference_code,
            'visited_at' => $previousCompletion->fresh()->visited_at->utc()->toISOString(),
            'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RSSI,
            'action_taken' => 'Previous action',
            'field_observation' => 'Previous observation',
            'field_finding' => 'Previous finding',
            'follow_up_outcome' => 'worsened',
            'fresh_photo_available' => true,
        ], $current['previous_visit']);
    }

    public function test_mobile_assignment_feed_returns_a_null_previous_visit_when_none_exists(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);

        Sanctum::actingAs($assignee, ['assignment:read']);
        $this->getJson('/api/v1/mobile/assignments')
            ->assertOk()
            ->assertJsonPath('data.0.previous_visit', null);
    }

    public function test_previous_evidence_photo_is_owner_scoped_and_private(): void
    {
        Storage::fake('local');
        $reviewer = User::factory()->reviewer()->create();
        $owner = User::factory()->fieldReporter()->create();
        $other = User::factory()->fieldReporter()->create();
        $previousReport = Report::factory()->create([
            'barangay' => 'Mabini',
            'farmer_or_farm_owner_name' => 'Farm Alpha',
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $previousAssignment = FieldValidationAssignment::factory()->create([
            'report_id' => $previousReport->getKey(),
            'assignee_id' => $owner->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        $photoPath = 'field-validation/previous/evidence.jpg';
        FieldValidationCompletion::factory()->create([
            'assignment_id' => $previousAssignment->getKey(),
            'visited_at' => '2026-09-10T08:30:00.000Z',
            'fresh_photo_path' => $photoPath,
            'fresh_photo_mime_type' => 'image/jpeg',
        ]);
        Storage::disk('local')->put($photoPath, 'previous evidence');
        $currentReport = Report::factory()->create([
            'barangay' => 'Mabini',
            'farmer_or_farm_owner_name' => 'Farm Alpha',
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $currentAssignment = FieldValidationAssignment::factory()->create([
            'report_id' => $currentReport->getKey(),
            'assignee_id' => $owner->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        $path = "/api/v1/mobile/assignments/{$currentAssignment->uuid}/previous-evidence-photo";

        Sanctum::actingAs($owner, ['assignment:read']);
        $response = $this->get($path)
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('private', $response->headers->get('Cache-Control'));
        $this->assertStringContainsString('max-age=300', $response->headers->get('Cache-Control'));

        Sanctum::actingAs($other, ['assignment:read']);
        $this->get($path)->assertForbidden();
    }

    public function test_assignment_contract_artifact_matches_the_mobile_response_boundary(): void
    {
        $contract = MobileFieldValidationAssignmentContract::definition();
        $this->assertSame('mobile-field-validation-assignment-v1', $contract['contract']);
        $this->assertSame('/api/v1/mobile/assignments', $contract['wire']['path']);
        $this->assertSame(
            [
                'uuid',
                'report_uuid',
                'report_client_uuid',
                'reference_code',
                'submitter',
                'assignee',
                'submitter_is_assignee',
                'target_visit_date',
                'field_validation_state',
                'assigned_at',
                'updated_at',
                'case',
                'previous_visit',
            ],
            array_keys($contract['fields']),
        );
        $this->assertSame(
            ['healthy', 'mosaic', 'rust', 'smut'],
            $contract['fields']['case']['properties']['predicted_label']['enum'],
        );
        $this->assertFalse($contract['fields']['previous_visit']['required']);
        $this->assertTrue($contract['fields']['previous_visit']['nullable']);
        $this->assertSame(
            [
                'reference_code',
                'visited_at',
                'reporter_suspected_condition',
                'authority_classified_condition',
                'action_taken',
                'field_observation',
                'field_finding',
                'follow_up_outcome',
                'fresh_photo_available',
            ],
            $contract['fields']['previous_visit']['required_keys'],
        );
    }
}
