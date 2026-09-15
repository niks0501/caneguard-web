<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportReportingTest extends TestCase
{
    use RefreshDatabase;

    public function test_export_is_filter_scoped_and_includes_case_lifecycle_assignment_and_referral_fields(): void
    {
        $reviewer = User::factory()->reviewer()->create(['name' => 'Office Reviewer']);
        $assignee = User::factory()->fieldReporter()->create(['name' => 'Field Validator']);
        $report = Report::factory()->create([
            'reference_code' => 'CG-EXPORT-MATCH',
            'reporter_id' => $assignee,
            'barangay' => 'Mabini',
            'farmer_or_farm_owner_name' => 'Juan Dela Cruz',
            'predicted_label' => Report::LABEL_RUST,
            'affected_area_hectares' => 12.5,
            'affected_portion_percent' => 42.75,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'referral_state' => Report::REFERRAL_STATE_REFERRED,
            'action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T10:00:00Z'),
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2026-09-12',
        ]);
        ReportReferral::factory()->create([
            'report_id' => $report->getKey(),
            'referred_by_id' => $reviewer->getKey(),
            'destination' => 'Regional crop protection office',
            'reference' => 'SRA-2026-0042',
            'referral_date' => '2026-09-05',
            'response_date' => '2026-09-08',
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-EXPORT-EXCLUDED',
            'barangay' => 'Poblacion',
            'predicted_label' => Report::LABEL_RUST,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T10:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $response = $this->get('/api/v1/reports/export?'.http_build_query([
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'queue' => Report::QUEUE_NEEDS_VISIT,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Mabini',
            'date_from' => '2026-09-04',
            'date_to' => '2026-09-04',
            'sort' => '-submitted_at',
        ]));

        $response
            ->assertOk()
            ->assertHeader('Content-Type', 'text/csv; charset=UTF-8')
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeader('Content-Disposition', 'attachment; filename=caneguard-case-export-'.now()->utc()->format('Y-m-d').'.csv');

        $rows = array_map(
            'str_getcsv',
            array_filter(preg_split('/\r\n|\r|\n/', trim($response->streamedContent())) ?: []),
        );

        $this->assertCount(2, $rows);
        $this->assertSame([
            'case_reference',
            'submitted_date',
            'barangay',
            'farmer_or_farm_reference',
            'possible_ai_condition',
            'affected_area_hectares',
            'affected_area_measurement',
            'affected_portion_percent',
            'affected_portion_measurement',
            'work_status',
            'verification_outcome',
            'case_state',
            'field_validation_state',
            'staff_classified_condition',
            'location_unavailable',
            'location_unavailable_reason',
            'field_validator',
            'assigned_by',
            'target_visit_date',
            'action_taken',
            'referral_state',
            'referral_destination',
            'referral_reference',
            'referral_date',
            'expert_response_date',
        ], $rows[0]);
        $this->assertSame([
            'CG-EXPORT-MATCH',
            '2026-09-04',
            'Mabini',
            'Juan Dela Cruz',
            'Possible rust',
            '12.50',
            Report::MEASUREMENT_MEASURED,
            '42.75',
            Report::MEASUREMENT_MEASURED,
            Report::STATUS_FOR_FIELD_VALIDATION,
            Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            Report::CASE_STATE_OPEN,
            Report::FIELD_VALIDATION_STATE_ASSIGNED,
            '',
            'no',
            '',
            'Field Validator',
            'Office Reviewer',
            '2026-09-12',
            Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            Report::REFERRAL_STATE_REFERRED,
            'Regional crop protection office',
            'SRA-2026-0042',
            '2026-09-05',
            '2026-09-08',
        ], $rows[1]);
    }

    public function test_export_neutralizes_formula_prefixes_in_all_text_cells(): void
    {
        $reviewer = User::factory()->reviewer()->create(['name' => "\rassigner"]);
        $assignee = User::factory()->fieldReporter()->create(['name' => "\tvalidator"]);
        $report = Report::factory()->create([
            'reference_code' => '=case-reference',
            'reporter_id' => $assignee->getKey(),
            'barangay' => '+barangay',
            'farmer_or_farm_owner_name' => '-farmer',
            'action_taken' => '@action',
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        ReportReferral::factory()->create([
            'report_id' => $report->getKey(),
            'referred_by_id' => $reviewer->getKey(),
            'destination' => "\ndestination",
            'reference' => '=external-reference',
            'referral_date' => '2026-09-05',
        ]);

        Sanctum::actingAs($reviewer);

        $response = $this->get('/api/v1/reports/export');
        $handle = fopen('php://temp', 'r+');
        $this->assertIsResource($handle);
        fwrite($handle, $response->streamedContent());
        rewind($handle);
        $rows = [];
        while (($row = fgetcsv($handle)) !== false) {
            $rows[] = $row;
        }
        fclose($handle);

        $this->assertSame("'=case-reference", $rows[1][0]);
        $this->assertSame("'+barangay", $rows[1][2]);
        $this->assertSame("'-farmer", $rows[1][3]);
        $this->assertSame("'\tvalidator", $rows[1][16]);
        $this->assertSame("'\rassigner", $rows[1][17]);
        $this->assertSame("'@action", $rows[1][19]);
        $this->assertSame("'\ndestination", $rows[1][21]);
        $this->assertSame("'=external-reference", $rows[1][22]);
    }

    public function test_export_and_monthly_summary_require_office_authority_and_validate_month(): void
    {
        $this->getJson('/api/v1/reports/export')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');
        $this->getJson('/api/v1/reports/summary')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());
        $this->getJson('/api/v1/reports/export')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
        $this->getJson('/api/v1/reports/summary')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->reviewer()->create());
        $this->getJson('/api/v1/reports/summary?month=2026-13')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR')
            ->assertJsonStructure(['errors' => ['month']]);
    }

    public function test_monthly_summary_is_case_based_and_uses_supported_review_times(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $first = Report::factory()->create([
            'reference_code' => 'CG-SUMMARY-ONE',
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'affected_area_hectares' => 2.5,
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-07-05T10:00:00Z'),
            'reviewed_at' => CarbonImmutable::parse('2026-07-06T10:00:00Z'),
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-SUMMARY-TWO',
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_MOSAIC,
            'affected_area_hectares' => 1.25,
            'case_state' => Report::CASE_STATE_CLOSED,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'submitted_at' => CarbonImmutable::parse('2026-07-10T10:00:00Z'),
            'reviewed_at' => CarbonImmutable::parse('2026-07-10T16:00:00Z'),
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-SUMMARY-THREE',
            'barangay' => 'Poblacion',
            'predicted_label' => Report::LABEL_RUST,
            'affected_area_hectares' => null,
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            'submitted_at' => CarbonImmutable::parse('2026-07-20T10:00:00Z'),
            'reviewed_at' => null,
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-SUMMARY-OUTSIDE-MONTH',
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'affected_area_hectares' => 50,
            'submitted_at' => CarbonImmutable::parse('2026-08-01T10:00:00Z'),
        ]);
        ReportReferral::factory()->create([
            'report_id' => $first->getKey(),
            'referred_by_id' => $reviewer->getKey(),
            'referral_date' => '2026-07-07',
        ]);

        Sanctum::actingAs($reviewer);

        $response = $this->getJson('/api/v1/reports/summary?month=2026-07')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.month', '2026-07')
            ->assertJsonPath('data.period.from', '2026-07-01')
            ->assertJsonPath('data.period.to', '2026-07-31')
            ->assertJsonPath('data.reported_cases', 3)
            ->assertJsonPath('data.estimated_affected_hectares', 3.75)
            ->assertJsonPath('data.closed_cases', 1)
            ->assertJsonPath('data.field_validation_counts.unassigned', 1)
            ->assertJsonPath('data.field_validation_counts.assigned', 1)
            ->assertJsonPath('data.field_validation_counts.completed', 1)
            ->assertJsonPath('data.field_validation_counts.requiring_validation', 1)
            ->assertJsonPath('data.review_time.reviewed_cases', 2)
            ->assertJsonPath('data.review_time.average_hours', 15)
            ->assertJsonPath('data.review_time.median_hours', 15)
            ->assertJsonPath('data.review_time.min_hours', 6)
            ->assertJsonPath('data.review_time.max_hours', 24);

        $response->assertJsonFragment([
            'barangay' => 'Mabini',
            'reported_cases' => 2,
        ]);
        $response->assertJsonFragment([
            'barangay' => 'Poblacion',
            'reported_cases' => 1,
        ]);
        $response->assertJsonFragment([
            'possible_condition' => Report::LABEL_RUST,
            'reported_cases' => 2,
        ]);
        $response->assertJsonFragment([
            'possible_condition' => Report::LABEL_MOSAIC,
            'reported_cases' => 1,
        ]);
        $response->assertJsonMissingPath('data.prevalence');
        $response->assertJsonMissingPath('data.infection_rate');
        $response->assertJsonMissingPath('data.outbreak_probability');
        $response->assertJsonMissingPath('data.disease_risk_score');
    }

    public function test_monthly_summary_includes_smut_as_possible_ai_evidence(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        Report::factory()->mobileModelV1()->create([
            'predicted_label' => Report::LABEL_SMUT,
            'submitted_at' => CarbonImmutable::parse('2026-07-21T10:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/summary?month=2026-07')
            ->assertOk()
            ->assertJsonFragment([
                'possible_condition' => Report::LABEL_SMUT,
                'reported_cases' => 1,
            ]);
    }

    public function test_dashboard_summary_exposes_the_selected_monthly_case_summary(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        Report::factory()->create([
            'submitted_at' => CarbonImmutable::parse('2026-06-15T10:00:00Z'),
            'barangay' => 'Mabini',
        ]);
        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/dashboard/summary?month=2026-06')
            ->assertOk()
            ->assertJsonPath('data.monthly_summary.month', '2026-06')
            ->assertJsonPath('data.monthly_summary.reported_cases', 1)
            ->assertJsonPath('data.monthly_summary.cases_by_barangay.0.barangay', 'Mabini');
    }
}
