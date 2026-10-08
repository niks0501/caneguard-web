<?php

namespace Tests\Feature;

use App\Contracts\MobileFieldValidationAssignmentContract;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\DashboardReportSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\ReportSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportSchemaAndSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_schema_contains_the_planned_tables_and_columns(): void
    {
        $this->assertTrue(Schema::hasColumns('reports', [
            'uuid',
            'reference_code',
            'reporter_id',
            'client_uuid',
            'scan_record_client_uuid',
            'barangay',
            'farmer_or_farm_owner_name',
            'province',
            'municipality',
            'final_latitude',
            'final_longitude',
            'location_source',
            'gps_accuracy',
            'observed_at',
            'sugarcane_variety',
            'crop_age',
            'cane_class',
            'affected_area_hectares',
            'affected_portion_percent',
            'field_notes',
            'mismatch_reported',
            'reporter_suspected_condition',
            'reporter_observation_text',
            'image_path',
            'image_mime_type',
            'image_size_bytes',
            'image_source_type',
            'source_width',
            'source_height',
            'predicted_label',
            'confidence',
            'checklist_consistency',
            'reported_severity',
            'model_version',
            'preprocess_ms',
            'inference_ms',
            'total_ms',
            'captured_at',
            'submitted_at',
            'review_status',
            'case_state',
            'verification_outcome',
            'field_validation_state',
            'referral_state',
            'action_taken',
            'review_notes',
            'authority_classified_condition',
            'reviewer_id',
            'reviewed_at',
            'first_reviewed_at',
            'lock_version',
            'canonical_report_id',
        ]));
        $this->assertTrue(Schema::hasTable('report_class_scores'));
        $this->assertTrue(Schema::hasTable('report_symptoms'));
        $this->assertTrue(Schema::hasTable('report_quality_warnings'));
        $this->assertTrue(Schema::hasTable('report_audits'));
        $this->assertTrue(Schema::hasTable('report_referrals'));
    }

    public function test_report_referrals_cascade_when_their_report_is_deleted(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create();
        $referral = ReportReferral::factory()->create([
            'report_id' => $report->getKey(),
        ]);

        DB::table('reports')
            ->where('id', $report->getKey())
            ->delete();

        $this->assertDatabaseMissing('report_referrals', [
            'id' => $referral->getKey(),
        ]);
    }

    public function test_report_factory_supports_smart_field_values_and_casts_them(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'sugarcane_variety' => 'PSR 86',
            'crop_age' => '6 months',
            'cane_class' => 'Class A',
            'affected_area_hectares' => 12.5,
            'affected_portion_percent' => 42.75,
            'field_notes' => 'Observed along the eastern edge.',
            'farmer_or_farm_owner_name' => 'Juan Dela Cruz',
            'province' => 'Negros Occidental',
            'municipality' => 'Bago',
            'final_latitude' => 10.1234567,
            'final_longitude' => 122.9876543,
            'location_source' => 'gps',
            'gps_accuracy' => 4.25,
            'observed_at' => '2026-07-20T09:58:00.000Z',
            'scan_record_client_uuid' => 'a9b3c7d1-e23c-43cb-a3ae-08ec6e0f302e',
            'mismatch_reported' => true,
            'reporter_suspected_condition' => 'smut',
            'reporter_observation_text' => 'Dark whip-like growths are visible.',
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
        ]);

        $this->assertSame('PSR 86', $report->sugarcane_variety);
        $this->assertSame('6 months', $report->crop_age);
        $this->assertSame('Class A', $report->cane_class);
        $this->assertSame('12.50', $report->affected_area_hectares);
        $this->assertSame('42.75', $report->affected_portion_percent);
        $this->assertSame('Observed along the eastern edge.', $report->field_notes);
        $this->assertSame('Juan Dela Cruz', $report->farmer_or_farm_owner_name);
        $this->assertSame('Negros Occidental', $report->province);
        $this->assertSame('Bago', $report->municipality);
        $this->assertSame('10.1234567', $report->final_latitude);
        $this->assertSame('122.9876543', $report->final_longitude);
        $this->assertSame('gps', $report->location_source);
        $this->assertSame('4.25', $report->gps_accuracy);
        $this->assertInstanceOf(CarbonImmutable::class, $report->observed_at);
        $this->assertSame(
            '2026-07-20T09:58:00.000000Z',
            $report->observed_at->utc()->toISOString(),
        );
        $this->assertSame(
            'a9b3c7d1-e23c-43cb-a3ae-08ec6e0f302e',
            $report->scan_record_client_uuid,
        );
        $this->assertTrue($report->mismatch_reported);
        $this->assertSame('smut', $report->reporter_suspected_condition);
        $this->assertSame('Dark whip-like growths are visible.', $report->reporter_observation_text);
        $this->assertSame(Report::AUTHORITY_CONDITION_SMUT, $report->authority_classified_condition);
        $this->assertSame(Report::CASE_STATE_OPEN, $report->case_state);
        $this->assertSame(
            Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            $report->verification_outcome,
        );
        $this->assertSame(
            Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            $report->field_validation_state,
        );
        $this->assertSame(Report::REFERRAL_STATE_NOT_REFERRED, $report->referral_state);
    }

    public function test_report_factory_supports_every_active_and_legacy_classification_value(): void
    {
        foreach (Report::authorityClassifiedConditions() as $condition) {
            $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
                'authority_classified_condition' => $condition,
            ]);

            $this->assertSame($condition, $report->fresh()->authority_classified_condition);
        }

        $this->assertSame(
            [Report::AUTHORITY_CONDITION_DOWNY_MILDEW],
            Report::legacyAuthorityClassifiedConditions(),
        );
    }

    public function test_report_referral_factory_preserves_the_handoff_fields(): void
    {
        $referral = ReportReferral::factory()->create([
            'destination' => 'Expert office',
            'reference' => 'REF-123',
            'referral_date' => '2026-09-04',
            'note' => 'Review the evidence.',
        ]);

        $this->assertSame('Expert office', $referral->destination);
        $this->assertSame('REF-123', $referral->reference);
        $this->assertSame('2026-09-04', $referral->referral_date->format('Y-m-d'));
        $this->assertSame('Review the evidence.', $referral->note);
    }

    public function test_legacy_report_values_can_leave_new_contract_fields_null(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'farmer_or_farm_owner_name' => null,
            'province' => null,
            'municipality' => null,
            'final_latitude' => null,
            'final_longitude' => null,
            'location_source' => null,
            'gps_accuracy' => null,
            'observed_at' => null,
            'scan_record_client_uuid' => null,
        ]);

        foreach ([
            'farmer_or_farm_owner_name',
            'province',
            'municipality',
            'final_latitude',
            'final_longitude',
            'location_source',
            'gps_accuracy',
            'observed_at',
            'scan_record_client_uuid',
            'mismatch_reported',
            'reporter_suspected_condition',
            'reporter_observation_text',
            'authority_classified_condition',
        ] as $field) {
            $this->assertNull($report->{$field}, "Expected {$field} to remain nullable.");
        }
    }

    public function test_seeder_preserves_existing_report_evidence(): void
    {
        Storage::fake('local');
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
        ]);

        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CUSTOM-REPORT-001',
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.7312345,
            'model_version' => 'caneguard-mobile-v1.0.0',
            'review_status' => Report::STATUS_RESOLVED,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_DOWNY_MILDEW,
            'reviewer_id' => $reviewer->id,
            'reviewed_at' => CarbonImmutable::parse('2026-07-20 12:00:00', 'UTC'),
        ]);
        $originalReport = (array) DB::table('reports')
            ->where('id', $report->id)
            ->first();
        $originalEvidence = [
            'class_scores' => DB::table('report_class_scores')
                ->where('report_id', $report->id)
                ->orderBy('label')
                ->get(['label', 'score'])
                ->map(fn ($score) => ['label' => $score->label, 'score' => $score->score])
                ->all(),
            'symptoms' => DB::table('report_symptoms')
                ->where('report_id', $report->id)
                ->orderBy('symptom_key')
                ->pluck('symptom_key')
                ->all(),
            'quality_warnings' => DB::table('report_quality_warnings')
                ->where('report_id', $report->id)
                ->orderBy('warning_key')
                ->pluck('warning_key')
                ->all(),
        ];

        $this->seed(DatabaseSeeder::class);

        $this->assertSame(
            $originalReport,
            (array) DB::table('reports')->where('id', $report->id)->first(),
        );
        $this->assertSame($originalEvidence, [
            'class_scores' => DB::table('report_class_scores')
                ->where('report_id', $report->id)
                ->orderBy('label')
                ->get(['label', 'score'])
                ->map(fn ($score) => ['label' => $score->label, 'score' => $score->score])
                ->all(),
            'symptoms' => DB::table('report_symptoms')
                ->where('report_id', $report->id)
                ->orderBy('symptom_key')
                ->pluck('symptom_key')
                ->all(),
            'quality_warnings' => DB::table('report_quality_warnings')
                ->where('report_id', $report->id)
                ->orderBy('warning_key')
                ->pluck('warning_key')
                ->all(),
        ]);
    }

    public function test_seeder_completes_an_existing_partial_seed_fixture(): void
    {
        Storage::fake('local');
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
        ]);

        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'BGO-20260702-0915',
            'client_uuid' => 'c93939fc-601e-42b3-8d30-c786b2402f78',
            'image_path' => 'reports/2026-07/bgo-20260702-0915.png',
            'predicted_label' => Report::LABEL_SMUT,
            'confidence' => 0.7312345,
            'model_version' => 'v1.0-mobilenetv2',
            'review_status' => Report::STATUS_RESOLVED,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_DOWNY_MILDEW,
        ]);
        DB::table('report_class_scores')->where('report_id', $report->id)->delete();
        DB::table('report_symptoms')->where('report_id', $report->id)->delete();
        $this->seed(DatabaseSeeder::class);
        $this->seed(ReportSeeder::class);

        $seededReport = Report::query()->findOrFail($report->id);
        $this->assertNotEmpty(DB::table('report_class_scores')
            ->where('report_id', $report->id)
            ->get());
        $this->assertNotEmpty(DB::table('report_symptoms')->where('report_id', $report->id)->get());
        Storage::disk('local')->assertExists('reports/2026-07/bgo-20260702-0915.png');
    }

    public function test_seeded_reports_are_available_through_mobile_and_report_apis(): void
    {
        Storage::fake('local');
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
        ]);

        $this->seedReportDemoDataset();
        $this->approveSeededPilotFixtures();

        Sanctum::actingAs(User::query()->where('email', 'field@caneguard.test')->firstOrFail(), ['assignment:read']);
        $assignments = $this->getJson('/api/v1/mobile/assignments')
            ->assertOk()
            ->json('data');
        $this->assertNotEmpty($assignments);
        $assignmentContract = MobileFieldValidationAssignmentContract::definition();
        foreach ($assignments as $assignment) {
            $this->assertSame(array_keys($assignmentContract['fields']), array_keys($assignment));
            $this->assertSame($assignmentContract['fields']['case']['required_keys'], array_keys($assignment['case']));
        }

        $unlocated = Report::query()->where('reference_code', 'BGO-20260702-0915')->firstOrFail();
        Sanctum::actingAs(User::query()->where('email', 'mao@caneguard.test')->firstOrFail());
        $this->getJson('/api/v1/reports?search='.urlencode($unlocated->farmer_or_farm_owner_name))
            ->assertOk()
            ->assertJsonPath('data.0.uuid', $unlocated->uuid)
            ->assertJsonPath('data.0.location_unavailable', true)
            ->assertJsonPath('data.0.location_unavailable_reason', $unlocated->location_unavailable_reason)
            ->assertJsonPath('data.0.affected_area_measurement', $unlocated->affected_area_measurement)
            ->assertJsonPath('data.0.affected_portion_measurement', $unlocated->affected_portion_measurement);
        $this->getJson('/api/v1/reports/'.$unlocated->uuid)
            ->assertOk()
            ->assertJsonPath('data.observations.location_source', $unlocated->location_source)
            ->assertJsonPath('data.observations.reported_severity', $unlocated->reported_severity)
            ->assertJsonPath('data.timestamps.observed_at', $unlocated->observed_at?->utc()->toISOString());

        $located = Report::query()->where('reference_code', 'BGO-20260703-1015')->firstOrFail();
        $originalLocation = $located->only(['final_latitude', 'final_longitude', 'municipality']);
        $followUp = Report::query()->where('reference_code', 'BGO-20260916-0745')->firstOrFail();
        $completion = $followUp->fieldValidationAssignment?->completion;
        $this->assertNotNull($completion);
        $originalGps = $completion->only(['gps_latitude', 'gps_longitude']);
        DB::table('reports')->where('id', $located->id)->update([
            'final_latitude' => 0,
            'final_longitude' => 0,
            'municipality' => 'Bago',
        ]);
        DB::table('field_validation_completions')->where('id', $completion->id)->update([
            'gps_latitude' => 0,
            'gps_longitude' => 0,
        ]);
        $this->seedReportDemoDataset();
        $this->assertSame($located->id, Report::query()->where('reference_code', $located->reference_code)->value('id'));
        $this->assertSame($originalLocation, Report::query()->findOrFail($located->id)->only(array_keys($originalLocation)));
        $this->assertSame($originalGps, $completion->fresh()->only(array_keys($originalGps)));

        $reports = $this->getJson('/api/v1/reports?per_page=10')->assertOk();
        $reportUuid = $reports->json('data.0.uuid');
        $this->assertNotEmpty($reportUuid);
        $this->getJson('/api/v1/reports/'.$reportUuid)
            ->assertOk()
            ->assertJsonPath('data.identity.uuid', $reportUuid);
        $this->getJson('/api/v1/reports/summary?month=2026-09')->assertOk();
    }

    public function test_merged_seed_path_populates_the_default_month_and_dashboard_panels(): void
    {
        Storage::fake('local');
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
        ]);

        $this->seedReportDemoDataset();
        $this->approveSeededPilotFixtures();

        $monthCounts = Report::query()
            ->get(['submitted_at'])
            ->groupBy(fn (Report $report): string => $report->submitted_at->timezone('Asia/Manila')->format('Y-m'))
            ->map(fn ($reports): int => $reports->count())
            ->all();

        $this->assertNotEmpty($monthCounts);

        Sanctum::actingAs(User::query()->where('email', 'mao@caneguard.test')->firstOrFail());
        $month = CarbonImmutable::now('Asia/Manila')->format('Y-m');
        $expectedMonthCount = $monthCounts[$month];

        $response = $this->getJson('/api/v1/dashboard/summary?month='.$month.'&include=counts,queues,recent,monthly')
            ->assertOk()
            ->assertJsonPath('data.monthly_summary.month', $month)
            ->assertJsonPath('data.monthly_summary.reported_cases', $expectedMonthCount);
        foreach (Report::fieldValidationStates() as $state) {
            $this->assertGreaterThan(
                0,
                $response->json("data.monthly_summary.field_validation_counts.{$state}"),
            );
        }
        $response->assertJsonMissingPath('data.monthly_summary.expert_verification');

        foreach (Report::operationalQueues() as $queue) {
            $this->assertGreaterThan(0, $response->json("data.queues.{$queue}"));
        }
    }

    private function seedReportDemoDataset(): void
    {
        config(['caneguard.pilot_district_code' => 'test-pilot']);
        $this->seed(DatabaseSeeder::class);
    }
}
