<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

class ReportApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_reports_are_searchable_filterable_sorted_and_paginated(): void
    {
        $reporter = User::factory()->fieldReporter()->create([
            'name' => 'Ana Field Reporter',
        ]);
        $reviewer = User::factory()->reviewer()->create();
        $highestConfidence = Report::factory()->create([
            'reporter_id' => $reporter,
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.93,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'province' => 'Negros Occidental',
            'municipality' => 'Bago',
            'observed_at' => CarbonImmutable::parse('2026-07-20T09:58:00Z'),
            'mismatch_reported' => true,
            'submitted_at' => CarbonImmutable::parse('2026-07-20T10:00:00Z'),
        ]);
        $middleConfidence = Report::factory()->create([
            'reporter_id' => $reporter,
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.88,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-07-20T09:00:00Z'),
        ]);
        $lowestConfidence = Report::factory()->create([
            'reporter_id' => $reporter,
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.77,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-07-20T08:00:00Z'),
        ]);
        Report::factory()->create([
            'barangay' => 'Poblacion',
            'predicted_label' => Report::LABEL_HEALTHY,
            'review_status' => Report::STATUS_RESOLVED,
            'submitted_at' => CarbonImmutable::parse('2026-07-18T10:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $query = [
            'search' => 'Ana Field',
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Mabini',
            'date_from' => '2026-07-20',
            'date_to' => '2026-07-20',
            'sort' => '-confidence',
            'per_page' => 2,
        ];

        $this->getJson('/api/v1/reports?'.http_build_query($query))
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.uuid', $highestConfidence->uuid)
            ->assertJsonPath('data.1.uuid', $middleConfidence->uuid)
            ->assertJsonPath('data.0.reporter.name', 'Ana Field Reporter')
            ->assertJsonPath(
                'data.0.captured_at',
                $highestConfidence->captured_at->utc()->toISOString(),
            )
            ->assertJsonPath(
                'data.0.image_url',
                route(
                    'api.v1.reports.image',
                    ['report' => $highestConfidence->uuid],
                ),
            )
            ->assertJsonPath('data.0.province', 'Negros Occidental')
            ->assertJsonPath('data.0.municipality', 'Bago')
            ->assertJsonPath('data.0.mismatch_reported', true)
            ->assertJsonPath(
                'data.0.observed_at',
                $highestConfidence->observed_at->utc()->toISOString(),
            )
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.total', 3)
            ->assertJsonStructure(['data', 'links', 'meta']);

        $this->getJson('/api/v1/reports?'.http_build_query([
            ...$query,
            'page' => 2,
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $lowestConfidence->uuid)
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.total', 3);
    }

    public function test_report_search_treats_like_wildcards_as_literal_text(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $literal = Report::factory()->create([
            'reference_code' => 'CG-2026-%_!',
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-2026-PLAIN',
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports?'.http_build_query([
            'search' => '%_!',
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $literal->uuid);
    }

    public function test_report_list_rejects_invalid_query_values(): void
    {
        Sanctum::actingAs(User::factory()->reviewer()->create());

        $this->getJson('/api/v1/reports?'.http_build_query([
            'page' => 0,
            'status' => 'confirmed',
            'predicted_label' => 'smut',
            'date_from' => '2026-07-20',
            'date_to' => '2026-07-19',
            'sort' => 'random',
        ]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR')
            ->assertJsonStructure([
                'errors' => [
                    'page',
                    'status',
                    'predicted_label',
                    'date_to',
                    'sort',
                ],
            ]);
    }

    public function test_report_detail_uses_uuid_and_returns_every_contract_section(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'scan_record_client_uuid' => 'a9b3c7d1-e23c-43cb-a3ae-08ec6e0f302e',
            'farmer_or_farm_owner_name' => 'Juan Dela Cruz',
            'province' => 'Negros Occidental',
            'municipality' => 'Bago',
            'final_latitude' => 10.1234567,
            'final_longitude' => 122.9876543,
            'location_source' => 'gps',
            'gps_accuracy' => 4.25,
            'observed_at' => CarbonImmutable::parse('2026-07-20T09:58:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.identity.uuid', $report->uuid)
            ->assertJsonPath(
                'data.identity.scan_record_client_uuid',
                'a9b3c7d1-e23c-43cb-a3ae-08ec6e0f302e',
            )
            ->assertJsonPath('data.timestamps.observed_at', '2026-07-20T09:58:00.000000Z')
            ->assertJsonPath(
                'data.observations.farmer_or_farm_owner_name',
                'Juan Dela Cruz',
            )
            ->assertJsonPath('data.observations.final_latitude', 10.1234567)
            ->assertJsonPath('data.observations.final_longitude', 122.9876543)
            ->assertJsonPath('data.observations.gps_accuracy', 4.25)
            ->assertJsonPath('data.reporter_observation.mismatch_reported', null)
            ->assertJsonPath('data.review.authority_classified_condition', null)
            ->assertJsonStructure([
                'data' => [
                    'identity',
                    'reporter',
                    'barangay',
                    'timestamps',
                    'image',
                    'model',
                    'observations',
                    'reporter_observation',
                    'review',
                    'updated_at',
                ],
            ]);

        $this->getJson('/api/v1/reports/not-a-real-uuid')
            ->assertNotFound()
            ->assertJsonPath('code', 'NOT_FOUND');
    }

    public function test_report_image_is_private_and_policy_authorized(): void
    {
        Storage::fake('local');
        $report = Report::factory()->create([
            'image_path' => 'reports/private-evidence.png',
            'image_mime_type' => 'image/png',
        ]);
        Storage::disk('local')->put(
            $report->image_path,
            'private-image-content',
        );
        $path = "/api/v1/reports/{$report->uuid}/image";

        $this->assertFalse(config('filesystems.disks.local.serve'));
        $this->get("/storage/{$report->image_path}")->assertNotFound();
        $this->getJson($path)
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());
        $this->getJson($path)
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->reviewer()->create());
        $response = $this->get($path);
        $response
            ->assertOk()
            ->assertHeader('content-type', 'image/png')
            ->assertHeader('cache-control', 'max-age=300, private')
            ->assertHeader('x-content-type-options', 'nosniff');
        $this->assertSame(
            'private-image-content',
            $response->streamedContent(),
        );
        $this->assertSame([], config('filesystems.links'));
    }

    public function test_dashboard_returns_all_status_counts_and_five_recent_reports(): void
    {
        $reviewer = User::factory()->reviewer()->create();

        foreach (Report::reviewStatuses() as $index => $status) {
            Report::factory()->create([
                'review_status' => $status,
                'submitted_at' => now()->subMinutes($index),
            ]);
        }
        Report::factory()->count(2)->create([
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            'submitted_at' => now()->subHour(),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('data.counts.total_submitted', 7)
            ->assertJsonPath('data.counts.submitted_unverified', 3)
            ->assertJsonPath('data.counts.for_field_validation', 1)
            ->assertJsonPath('data.counts.verified_by_staff', 1)
            ->assertJsonPath('data.counts.unable_to_verify', 1)
            ->assertJsonPath('data.counts.resolved', 1)
            ->assertJsonPath('data.queues.needs_review', 3)
            ->assertJsonPath('data.queues.needs_visit', 1)
            ->assertJsonPath('data.queues.follow_up_due', 0)
            ->assertJsonCount(5, 'data.recent_reports');
    }

    public function test_operational_report_queues_share_lifecycle_and_target_date_semantics(): void
    {
        CarbonImmutable::setTestNow('2026-09-10 09:00:00');
        try {
            $reviewer = User::factory()->reviewer()->create();
            $assignee = User::factory()->fieldReporter()->create();
            $needsReview = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-REVIEW',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
                'action_taken' => null,
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            ]);
            $needsVisit = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-VISIT',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ]);
            FieldValidationAssignment::factory()->create([
                'report_id' => $needsVisit->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-09',
            ]);
            $completedVisit = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-COMPLETED',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ]);
            FieldValidationAssignment::factory()->create([
                'report_id' => $completedVisit->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-01',
            ]);
            $todayVisit = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-TODAY',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ]);
            FieldValidationAssignment::factory()->create([
                'report_id' => $todayVisit->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-10',
            ]);
            $noDateVisit = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-NO-DATE',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ]);
            FieldValidationAssignment::factory()->create([
                'report_id' => $noDateVisit->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => null,
            ]);
            $closedVisit = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-CLOSED',
                'case_state' => Report::CASE_STATE_CLOSED,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ]);
            FieldValidationAssignment::factory()->create([
                'report_id' => $closedVisit->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-01',
            ]);

            Sanctum::actingAs($reviewer);

            $this->getJson('/api/v1/reports?queue=needs_review')
                ->assertOk()
                ->assertJsonPath('meta.total', 2)
                ->assertJsonFragment(['reference_code' => $needsReview->reference_code])
                ->assertJsonFragment(['reference_code' => $completedVisit->reference_code])
                ->assertJsonMissing(['reference_code' => $needsVisit->reference_code]);

            $this->getJson('/api/v1/reports?queue=needs_visit')
                ->assertOk()
                ->assertJsonPath('meta.total', 3)
                ->assertJsonFragment(['reference_code' => $needsVisit->reference_code])
                ->assertJsonFragment(['reference_code' => $todayVisit->reference_code])
                ->assertJsonFragment(['reference_code' => $noDateVisit->reference_code])
                ->assertJsonMissing(['reference_code' => $completedVisit->reference_code]);

            $this->getJson('/api/v1/reports?queue=follow_up_due')
                ->assertOk()
                ->assertJsonPath('meta.total', 1)
                ->assertJsonFragment(['reference_code' => $needsVisit->reference_code])
                ->assertJsonMissing(['reference_code' => $todayVisit->reference_code])
                ->assertJsonMissing(['reference_code' => $noDateVisit->reference_code])
                ->assertJsonMissing(['reference_code' => $closedVisit->reference_code]);

            $this->getJson('/api/v1/reports/map?queue=needs_visit')
                ->assertOk()
                ->assertJsonPath('metadata.total_count', 3)
                ->assertJsonPath('metadata.located_count', 3);

            $this->getJson('/api/v1/reports/map?queue=follow_up_due')
                ->assertOk()
                ->assertJsonPath('metadata.total_count', 1)
                ->assertJsonPath('features.0.properties.reference_code', $needsVisit->reference_code);

            $this->getJson('/api/v1/reports/field-validation-queue?queue=follow_up_due')
                ->assertOk()
                ->assertJsonPath('data.queue', Report::QUEUE_FOLLOW_UP_DUE)
                ->assertJsonPath('data.count', 1)
                ->assertJsonPath('data.items.0.reference_code', $needsVisit->reference_code)
                ->assertJsonPath('data.items.0.target_visit_date', '2026-09-09');
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_report_queue_rejects_unauthenticated_and_wrong_role_users(): void
    {
        $this->getJson('/api/v1/reports')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());

        $this->getJson('/api/v1/reports')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_unexpected_api_errors_do_not_leak_exception_details(): void
    {
        Route::get('/api/v1/forced-failure', function (): never {
            throw new RuntimeException('Sensitive internal failure detail.');
        });

        $this->getJson('/api/v1/forced-failure')
            ->assertInternalServerError()
            ->assertExactJson([
                'message' => 'An unexpected server error occurred.',
                'code' => 'SERVER_ERROR',
            ]);
    }
}
