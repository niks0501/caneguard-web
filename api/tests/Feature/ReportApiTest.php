<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\ReportReviewEvent;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
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
        $newestSubmission = Report::factory()->create([
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
        $middleSubmission = Report::factory()->create([
            'reporter_id' => $reporter,
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.88,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-07-20T09:00:00Z'),
        ]);
        $oldestSubmission = Report::factory()->create([
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
            'sort' => '-submitted_at',
            'per_page' => 2,
        ];

        $this->getJson('/api/v1/reports?'.http_build_query($query))
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.uuid', $newestSubmission->uuid)
            ->assertJsonPath('data.1.uuid', $middleSubmission->uuid)
            ->assertJsonPath('data.0.reporter.name', 'Ana Field Reporter')
            ->assertJsonPath(
                'data.0.captured_at',
                $newestSubmission->captured_at->utc()->toISOString(),
            )
            ->assertJsonPath(
                'data.0.image_url',
                route(
                    'api.v1.reports.image',
                    ['report' => $newestSubmission->uuid],
                ),
            )
            ->assertJsonPath('data.0.province', 'Negros Occidental')
            ->assertJsonPath('data.0.municipality', 'Bago')
            ->assertJsonPath('data.0.mismatch_reported', true)
            ->assertJsonPath(
                'data.0.observed_at',
                $newestSubmission->observed_at->utc()->toISOString(),
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
            ->assertJsonPath('data.0.uuid', $oldestSubmission->uuid)
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.total', 3);
    }

    public function test_report_queue_sorts_by_operational_age_and_due_date_only(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $older = Report::factory()->create([
            'submitted_at' => CarbonImmutable::parse('2026-07-10T10:00:00Z'),
        ]);
        $newer = Report::factory()->create([
            'submitted_at' => CarbonImmutable::parse('2026-07-20T10:00:00Z'),
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $newer->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2026-08-01',
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports?sort=submitted_at')
            ->assertOk()
            ->assertJsonPath('data.0.uuid', $older->uuid);

        $this->getJson('/api/v1/reports?sort=-submitted_at')
            ->assertOk()
            ->assertJsonPath('data.0.uuid', $newer->uuid);

        $this->getJson('/api/v1/reports?sort=due_soonest')
            ->assertOk()
            ->assertJsonPath('data.0.uuid', $newer->uuid);

        foreach (['confidence', '-confidence'] as $removedSort) {
            $this->getJson('/api/v1/reports?sort='.$removedSort)
                ->assertStatus(422)
                ->assertJsonPath('code', 'VALIDATION_ERROR');
        }
    }

    public function test_unverified_no_active_work_queue_catches_the_open_gap(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $unqueued = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
        ]);
        $activeReferral = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            'referral_state' => Report::REFERRAL_STATE_REFERRED,
        ]);
        $technicalAssistance = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
        ]);
        $cancelledReferral = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
        ]);
        $closed = Report::factory()->create([
            'case_state' => Report::CASE_STATE_CLOSED,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports?queue='.Report::QUEUE_UNVERIFIED_NO_ACTIVE_WORK)
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonFragment(['uuid' => $unqueued->uuid])
            ->assertJsonFragment(['uuid' => $technicalAssistance->uuid])
            ->assertJsonFragment(['uuid' => $cancelledReferral->uuid])
            ->assertJsonMissing(['uuid' => $activeReferral->uuid])
            ->assertJsonMissing(['uuid' => $closed->uuid]);
    }

    public function test_queue_rows_expose_existing_machine_facts_without_confidence_sorting(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'confidence' => 0.93,
            'checklist_consistency' => 'inconsistent',
            'gps_accuracy' => 6.5,
            'location_source' => Report::LOCATION_SOURCE_GPS,
            'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
            'mismatch_reported' => true,
        ]);
        $report->qualityWarnings()->create([
            'warning_key' => 'low_light',
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports')
            ->assertOk()
            ->assertJsonMissingPath('data.0.machine_facts.confidence')
            ->assertJsonPath('data.0.machine_facts.checklist_consistency', 'inconsistent')
            ->assertJsonPath('data.0.machine_facts.quality_warnings.0', 'low_light')
            ->assertJsonPath('data.0.machine_facts.gps_accuracy', 6.5)
            ->assertJsonPath('data.0.machine_facts.location_source', Report::LOCATION_SOURCE_GPS)
            ->assertJsonPath('data.0.machine_facts.reporter_concern', Report::REPORTER_CONCERN_RSSI)
            ->assertJsonPath('data.0.machine_facts.reporter_mismatch', true);
    }

    public function test_calibrated_attention_bands_reorder_needs_review_without_hiding_cases(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        Report::factory()->create([
            'case_state' => Report::CASE_STATE_CLOSED,
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RUST,
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.9,
            'checklist_consistency' => 'consistent',
            'mismatch_reported' => false,
            'location_source' => Report::LOCATION_SOURCE_GPS,
            'gps_accuracy' => 5,
            'first_reviewed_at' => '2026-09-01 10:00:00.000',
        ]);
        $red = Report::factory()->create([
            'reference_code' => 'CG-TRIAGE-RED',
            'submitted_at' => '2026-09-20 12:00:00.000',
            'confidence' => 0.95,
            'checklist_consistency' => 'inconclusive',
            'mismatch_reported' => true,
            'location_source' => Report::LOCATION_SOURCE_GPS,
            'gps_accuracy' => 5,
            'reported_severity' => 'high',
        ]);
        $amber = Report::factory()->create([
            'reference_code' => 'CG-TRIAGE-AMBER',
            'submitted_at' => '2026-09-20 11:00:00.000',
            'confidence' => 0.7,
            'checklist_consistency' => 'consistent',
            'mismatch_reported' => false,
            'location_source' => Report::LOCATION_SOURCE_GPS,
            'gps_accuracy' => 5,
            'reported_severity' => 'moderate',
        ]);
        $green = Report::factory()->create([
            'reference_code' => 'CG-TRIAGE-GREEN',
            'submitted_at' => '2026-09-20 10:00:00.000',
            'confidence' => 0.92,
            'checklist_consistency' => 'consistent',
            'mismatch_reported' => false,
            'location_source' => Report::LOCATION_SOURCE_GPS,
            'gps_accuracy' => 5,
            'reported_severity' => 'low',
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports?'.http_build_query([
            'queue' => Report::QUEUE_NEEDS_REVIEW,
            'sort' => 'submitted_at',
            'per_page' => 10,
        ]))
            ->assertOk()
            ->assertJsonPath('data.0.reference_code', 'CG-TRIAGE-RED')
            ->assertJsonPath('data.0.attention_band', 'red')
            ->assertJsonPath('data.1.reference_code', 'CG-TRIAGE-AMBER')
            ->assertJsonPath('data.1.attention_band', 'amber')
            ->assertJsonPath('data.2.reference_code', 'CG-TRIAGE-GREEN')
            ->assertJsonPath('data.2.attention_band', 'green')
            ->assertJsonPath('meta.total', 3);
    }

    public function test_report_detail_projects_typed_case_history_from_existing_review_sources(): void
    {
        $reviewer = User::factory()->reviewer()->create(['name' => 'Office reviewer']);
        $report = Report::factory()->create();
        $report->audits()->create([
            'actor_id' => $reviewer->getKey(),
            'field' => 'barangay',
            'original_value' => 'Mabini',
            'corrected_value' => 'Poblacion',
            'reason' => 'Corrected from the field sheet.',
            'created_at' => '2026-09-20 10:00:00.000',
        ]);
        ReportReviewEvent::query()->create([
            'report_id' => $report->getKey(),
            'actor_id' => $reviewer->getKey(),
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'case_state' => Report::CASE_STATE_OPEN,
            'created_at' => '2026-09-20 11:00:00.000',
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.case_history.available', true)
            ->assertJsonPath('data.case_history.sources.review_events', true)
            ->assertJsonPath('data.case_history.sources.corrections', true)
            ->assertJsonFragment(['type' => 'review'])
            ->assertJsonFragment(['type' => 'correction'])
            ->assertJsonPath('data.first_reviewed_at', null);
    }

    public function test_report_queue_filters_by_the_independent_lifecycle_concepts(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assigned = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RUST,
        ]);
        Report::factory()->create([
            'case_state' => Report::CASE_STATE_CLOSED,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports?case_state='.Report::CASE_STATE_OPEN)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $assigned->uuid);

        $this->getJson('/api/v1/reports?field_validation_state='.Report::FIELD_VALIDATION_STATE_ASSIGNED)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $assigned->uuid);

        $this->getJson('/api/v1/reports?verification_outcome='.Report::VERIFICATION_OUTCOME_VERIFIED)
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/v1/reports?authority_classified_condition='.Report::AUTHORITY_CONDITION_RUST)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $assigned->uuid);
    }

    public function test_report_queue_rows_expose_operational_priority_without_confidence_sorting(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RUST,
            'location_source' => Report::LOCATION_SOURCE_UNAVAILABLE,
            'location_unavailable_reason' => Report::LOCATION_UNAVAILABLE_REASON_LOW_ACCURACY,
            'affected_area_hectares' => null,
            'affected_area_measurement' => Report::MEASUREMENT_NOT_MEASURED,
            'submitted_at' => CarbonImmutable::parse('2026-07-20T10:00:00Z'),
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2026-07-01',
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports')
            ->assertOk()
            ->assertJsonPath('data.0.authority_classified_condition', Report::AUTHORITY_CONDITION_RUST)
            ->assertJsonPath('data.0.location_unavailable', true)
            ->assertJsonPath(
                'data.0.location_unavailable_reason',
                Report::LOCATION_UNAVAILABLE_REASON_LOW_ACCURACY,
            )
            ->assertJsonPath('data.0.affected_area_measurement', Report::MEASUREMENT_NOT_MEASURED)
            ->assertJsonPath('data.0.affected_area_hectares', null)
            ->assertJsonPath('data.0.follow_up.due_on', '2026-07-01')
            ->assertJsonPath('data.0.follow_up.overdue', true)
            ->assertJsonPath('data.0.review_status', $report->review_status)
            ->assertJsonMissingPath('data.0.confidence');
    }

    public function test_report_search_and_reported_concern_filter_keep_rssi_signals_separate(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $reportedOnly = Report::factory()->create([
            'farmer_or_farm_owner_name' => 'Farm Alpha',
            'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
            'authority_classified_condition' => null,
        ]);
        $classifiedOnly = Report::factory()->create([
            'farmer_or_farm_owner_name' => 'Farm Beta',
            'reporter_suspected_condition' => null,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RSSI,
        ]);
        $reportedAndClassified = Report::factory()->create([
            'farmer_or_farm_owner_name' => 'Farm Gamma',
            'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RSSI,
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports?search='.urlencode('Farm Alpha'))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $reportedOnly->uuid)
            ->assertJsonPath('data.0.farm_reference', 'Farm Alpha');

        $this->getJson('/api/v1/reports?concern=rssi')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['uuid' => $reportedOnly->uuid])
            ->assertJsonFragment(['uuid' => $reportedAndClassified->uuid])
            ->assertJsonMissing(['uuid' => $classifiedOnly->uuid]);

        $this->getJson('/api/v1/reports?concern=rssi&authority_classified_condition=rssi')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $reportedAndClassified->uuid)
            ->assertJsonPath('data.0.reporter_suspected_condition', Report::REPORTER_CONCERN_RSSI)
            ->assertJsonPath('data.0.authority_classified_condition', Report::AUTHORITY_CONDITION_RSSI);

        $this->getJson('/api/v1/reports?concern=not-a-concern')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR')
            ->assertJsonStructure(['errors' => ['concern']]);
    }

    public function test_report_list_exposes_monitoring_register_validation_summary(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create(['name' => 'Field Officer']);
        $report = Report::factory()->create([
            'farmer_or_farm_owner_name' => 'Farm Register Entry',
            'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
            'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2026-09-22',
        ]);
        FieldValidationCompletion::factory()->create([
            'assignment_id' => $assignment->getKey(),
            'visited_at' => '2026-09-23 08:00:00.000',
            'field_finding' => 'Validation finding for the register.',
            'follow_up_outcome' => 'worsened',
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports?concern=rssi')
            ->assertOk()
            ->assertJsonPath('data.0.farm_reference', 'Farm Register Entry')
            ->assertJsonPath('data.0.field_validation.target_visit_date', '2026-09-22')
            ->assertJsonPath('data.0.field_validation.assignee.name', 'Field Officer')
            ->assertJsonPath('data.0.latest_validation.finding', 'Validation finding for the register.')
            ->assertJsonPath('data.0.latest_validation.follow_up_outcome', 'worsened')
            ->assertJsonPath('data.0.latest_validation.visited_at', '2026-09-23T08:00:00.000000Z')
            ->assertJsonPath('data.0.action_taken', Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED);
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
            'predicted_label' => 'downy_mildew',
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

    public function test_report_list_accepts_smut_model_reports(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->mobileModelV1()->create([
            'predicted_label' => Report::LABEL_SMUT,
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports?predicted_label='.Report::LABEL_SMUT)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $report->uuid)
            ->assertJsonPath('data.0.predicted_label', Report::LABEL_SMUT);
    }

    public function test_report_detail_preserves_a_smut_model_v1_evidence_shape(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->mobileModelV1()->create([
            'predicted_label' => Report::LABEL_SMUT,
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.model.predicted_label', Report::LABEL_SMUT)
            ->assertJsonCount(4, 'data.model.class_scores')
            ->assertJsonPath('data.model.class_scores.3.label', Report::LABEL_SMUT)
            ->assertJsonPath('data.observations.symptom_keys.0', Report::LABEL_SMUT);
    }

    public function test_report_detail_preserves_historical_downy_mildew_classification(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_DOWNY_MILDEW,
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath(
                'data.review.authority_classified_condition',
                Report::AUTHORITY_CONDITION_DOWNY_MILDEW,
            );
    }

    public function test_report_detail_preserves_rssi_reporter_observation_separately_from_model_evidence(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->mobileModelV1()->create([
            'predicted_label' => Report::LABEL_RUST,
            'mismatch_reported' => true,
            'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
            'reporter_observation_text' => 'RSSI concern observed in the field.',
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.model.predicted_label', Report::LABEL_RUST)
            ->assertJsonCount(4, 'data.model.class_scores')
            ->assertJsonPath('data.reporter_observation.mismatch_reported', true)
            ->assertJsonPath(
                'data.reporter_observation.reporter_suspected_condition',
                Report::REPORTER_CONCERN_RSSI,
            )
            ->assertJsonPath(
                'data.reporter_observation.reporter_observation_text',
                'RSSI concern observed in the field.',
            )
            ->assertJsonPath('data.review.authority_classified_condition', null);
    }

    public function test_report_detail_preserves_unavailable_location_and_not_measured_provenance(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'location_source' => Report::LOCATION_SOURCE_UNAVAILABLE,
            'location_unavailable_reason' => Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
            'final_latitude' => null,
            'final_longitude' => null,
            'gps_accuracy' => null,
            'affected_area_hectares' => null,
            'affected_area_measurement' => Report::MEASUREMENT_NOT_MEASURED,
            'affected_portion_percent' => null,
            'affected_portion_measurement' => Report::MEASUREMENT_NOT_MEASURED,
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.observations.location_source', Report::LOCATION_SOURCE_UNAVAILABLE)
            ->assertJsonPath('data.observations.location_unavailable', true)
            ->assertJsonPath(
                'data.observations.location_unavailable_reason',
                Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
            )
            ->assertJsonPath('data.observations.affected_area_measurement', Report::MEASUREMENT_NOT_MEASURED)
            ->assertJsonPath('data.observations.affected_portion_measurement', Report::MEASUREMENT_NOT_MEASURED)
            ->assertJsonPath('data.observations.affected_area_hectares', null)
            ->assertJsonPath('data.observations.affected_portion_percent', null);
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

    public function test_report_detail_stays_available_when_review_events_migration_is_not_present(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();

        Schema::dropIfExists('report_review_events');
        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.identity.uuid', $report->uuid)
            ->assertJsonMissingPath('data.review_events');

        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('data.status', 'ok');
    }

    public function test_report_detail_includes_completed_field_validation_evidence_for_reviewers(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        FieldValidationCompletion::factory()->create([
            'assignment_id' => $assignment->getKey(),
            'field_observation' => 'Fresh observation from the assigned validation visit.',
            'field_finding' => 'The field finding is preserved as separate evidence.',
            'action_taken' => 'Provided field guidance and recorded the next action.',
            'follow_up_outcome' => 'improved',
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath(
                'data.field_validation_assignment.completion.field_observation',
                'Fresh observation from the assigned validation visit.',
            )
            ->assertJsonPath(
                'data.field_validation_assignment.completion.field_finding',
                'The field finding is preserved as separate evidence.',
            )
            ->assertJsonPath(
                'data.field_validation_assignment.completion.action_taken',
                'Provided field guidance and recorded the next action.',
            )
            ->assertJsonPath('data.field_validation_assignment.completion.follow_up_outcome', 'improved')
            ->assertJsonFragment(['label' => 'Follow-up outcome', 'value' => 'Improved'])
            ->assertJsonPath(
                'data.lifecycle.field_validation_state',
                Report::FIELD_VALIDATION_STATE_COMPLETED,
            )
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_OPEN)
            ->assertJsonPath(
                'data.lifecycle.verification_outcome',
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            );
    }

    public function test_validation_photo_is_private_and_policy_authorized(): void
    {
        Storage::fake('local');
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        $completion = FieldValidationCompletion::factory()->create([
            'assignment_id' => $assignment->getKey(),
            'fresh_photo_path' => 'field-validation/'.$assignment->uuid.'/fresh.jpg',
            'fresh_photo_mime_type' => 'image/jpeg',
        ]);
        Storage::disk('local')->put($completion->fresh_photo_path, 'validation-photo-content');
        $path = "/api/v1/reports/{$report->uuid}/validation-photo";

        $this->getJson($path)
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());
        $this->getJson($path)
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs($reviewer);
        $response = $this->get($path);
        $response
            ->assertOk()
            ->assertHeader('content-type', 'image/jpeg')
            ->assertHeader('cache-control', 'max-age=300, private')
            ->assertHeader('x-content-type-options', 'nosniff');
        $this->assertSame('validation-photo-content', $response->streamedContent());
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
            ->assertJsonPath('data.queues.unverified_no_active_work', 0)
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

            $this->getJson('/api/v1/reports?queue=upcoming')
                ->assertOk()
                ->assertJsonPath('meta.total', 1)
                ->assertJsonFragment(['reference_code' => $todayVisit->reference_code])
                ->assertJsonMissing(['reference_code' => $needsVisit->reference_code])
                ->assertJsonMissing(['reference_code' => $noDateVisit->reference_code]);

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

    public function test_operational_queue_dashboard_map_and_workspace_lists_share_predicates(): void
    {
        CarbonImmutable::setTestNow('2026-09-18T09:00:00+08:00');
        try {
            $reviewer = User::factory()->reviewer()->create();
            $assignee = User::factory()->fieldReporter()->create();
            $submitted = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-CHECK-REVIEW',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
                'action_taken' => null,
            ]);
            $expertResponse = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-CHECK-EXPERT-RESPONSE',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
                'referral_state' => Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            ]);
            $legacyUnassignedVisit = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-CHECK-LEGACY-VISIT',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ]);
            $overdueVisit = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-CHECK-OVERDUE',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ]);
            $upcomingVisit = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-CHECK-UPCOMING',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ]);
            foreach ([[$overdueVisit, '2026-09-17'], [$upcomingVisit, '2026-09-18']] as [$report, $targetDate]) {
                FieldValidationAssignment::factory()->create([
                    'report_id' => $report->getKey(),
                    'assignee_id' => $assignee->getKey(),
                    'assigned_by_id' => $reviewer->getKey(),
                    'target_visit_date' => $targetDate,
                ]);
            }
            $noActiveWork = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-CHECK-NO-WORK',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
                'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            ]);
            $closed = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-CHECK-CLOSED',
                'case_state' => Report::CASE_STATE_CLOSED,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
                'review_status' => Report::STATUS_RESOLVED,
            ]);
            $duplicate = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-CHECK-DUPLICATE',
                'canonical_report_id' => $submitted->getKey(),
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            ]);

            Sanctum::actingAs($reviewer);
            $expected = [
                Report::QUEUE_NEEDS_REVIEW => [$submitted->uuid, $expertResponse->uuid],
                Report::QUEUE_NEEDS_VISIT => [$legacyUnassignedVisit->uuid, $overdueVisit->uuid, $upcomingVisit->uuid],
                Report::QUEUE_FOLLOW_UP_DUE => [$overdueVisit->uuid],
                Report::QUEUE_UPCOMING => [$upcomingVisit->uuid],
                Report::QUEUE_UNVERIFIED_NO_ACTIVE_WORK => [$noActiveWork->uuid],
            ];
            $queuedUuids = array_merge(...array_values($expected));
            $this->assertNotContains($closed->uuid, $queuedUuids);
            $this->assertNotContains($duplicate->uuid, $queuedUuids);
            $dashboard = $this->getJson('/api/v1/dashboard/summary')->assertOk();
            foreach ($expected as $queue => $expectedUuids) {
                $count = count($expectedUuids);
                $dashboard->assertJsonPath('data.queues.'.$queue, $count);
                $reports = $this->getJson('/api/v1/reports?queue='.$queue)
                    ->assertOk()
                    ->assertJsonPath('meta.total', $count);
                $this->assertEqualsCanonicalizing($expectedUuids, array_column($reports->json('data'), 'uuid'));
                $this->getJson('/api/v1/reports/map?queue='.$queue)
                    ->assertOk()
                    ->assertJsonPath('metadata.total_count', $count);
            }
            foreach ([Report::QUEUE_NEEDS_VISIT, Report::QUEUE_FOLLOW_UP_DUE, Report::QUEUE_UPCOMING] as $queue) {
                $workspace = $this->getJson('/api/v1/reports/field-validation-queue?queue='.$queue)
                    ->assertOk()
                    ->assertJsonPath('data.count', count($expected[$queue]));
                $this->assertEqualsCanonicalizing($expected[$queue], array_column($workspace->json('data.items'), 'uuid'));
            }
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_operational_queue_target_dates_use_manila_day_boundaries(): void
    {
        CarbonImmutable::setTestNow('2026-09-30T15:59:59Z');
        try {
            $reviewer = User::factory()->reviewer()->create();
            $assignee = User::factory()->fieldReporter()->create();
            $septemberVisit = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-PHT-SEP',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ]);
            $octoberVisit = Report::factory()->create([
                'reference_code' => 'CG-QUEUE-PHT-OCT',
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ]);
            foreach ([[$septemberVisit, '2026-09-30'], [$octoberVisit, '2026-10-01']] as [$report, $targetDate]) {
                FieldValidationAssignment::factory()->create([
                    'report_id' => $report->getKey(),
                    'assignee_id' => $assignee->getKey(),
                    'assigned_by_id' => $reviewer->getKey(),
                    'target_visit_date' => $targetDate,
                ]);
            }
            Sanctum::actingAs($reviewer);

            $this->getJson('/api/v1/reports?queue=follow_up_due')
                ->assertOk()->assertJsonPath('meta.total', 0);
            $this->getJson('/api/v1/reports/field-validation-queue?queue=upcoming')
                ->assertOk()->assertJsonPath('data.count', 2);
            $this->getJson('/api/v1/dashboard/summary')
                ->assertOk()
                ->assertJsonPath('data.queues.needs_visit', 2)
                ->assertJsonPath('data.queues.follow_up_due', 0)
                ->assertJsonPath('data.queues.upcoming', 2);

            CarbonImmutable::setTestNow('2026-09-30T16:00:00Z');

            $this->getJson('/api/v1/reports?queue=follow_up_due')
                ->assertOk()
                ->assertJsonPath('meta.total', 1)
                ->assertJsonFragment(['uuid' => $septemberVisit->uuid]);
            $this->getJson('/api/v1/reports/field-validation-queue?queue=follow_up_due')
                ->assertOk()
                ->assertJsonPath('data.count', 1)
                ->assertJsonPath('data.items.0.uuid', $septemberVisit->uuid);
            $this->getJson('/api/v1/reports?queue=upcoming')
                ->assertOk()
                ->assertJsonPath('meta.total', 1)
                ->assertJsonFragment(['uuid' => $octoberVisit->uuid]);
            $this->getJson('/api/v1/dashboard/summary')
                ->assertOk()
                ->assertJsonPath('data.queues.needs_visit', 2)
                ->assertJsonPath('data.queues.follow_up_due', 1)
                ->assertJsonPath('data.queues.upcoming', 1);
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_report_queue_rejects_unauthenticated_and_wrong_role_users(): void
    {
        $this->getJson('/api/v1/reports?concern=rssi')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());

        $this->getJson('/api/v1/reports?concern=rssi')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_unauthenticated_non_json_api_requests_use_the_json_auth_contract_without_error_logging(): void
    {
        Log::spy();
        Log::shouldNotReceive('error');

        $this->get('/api/v1/me')
            ->assertUnauthorized()
            ->assertExactJson([
                'message' => 'Unauthenticated.',
                'code' => 'UNAUTHENTICATED',
            ]);
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

    public function test_non_api_errors_remain_safe_when_debug_is_enabled(): void
    {
        config(['app.debug' => true]);
        Route::post('/forced-failure', function (): never {
            throw new RuntimeException('Sensitive internal failure detail.');
        });

        $this->post('/forced-failure')
            ->assertInternalServerError()
            ->assertHeader('Content-Type', 'text/html; charset=UTF-8')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertSee('Request could not be completed')
            ->assertDontSee('Sensitive internal failure detail.')
            ->assertDontSee('Whoops')
            ->assertDontSee('vendor/');
    }
}
