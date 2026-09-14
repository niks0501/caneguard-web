<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\ReportClassScore;
use App\Models\ReportReferral;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
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
            'lock_version',
            'canonical_report_id',
        ]));
        $this->assertTrue(Schema::hasTable('report_class_scores'));
        $this->assertTrue(Schema::hasTable('report_symptoms'));
        $this->assertTrue(Schema::hasTable('report_quality_warnings'));
        $this->assertTrue(Schema::hasTable('report_audits'));
        $this->assertTrue(Schema::hasTable('report_referrals'));
    }

    public function test_report_factory_supports_smart_field_values_and_casts_them(): void
    {
        $report = Report::factory()->create([
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
        $report = Report::factory()->create([
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

        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'reference_code' => 'CG-2026-0001',
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

        $report = Report::factory()->create([
            'reference_code' => 'CG-2026-0001',
            'client_uuid' => '30000000-0000-4000-8000-000000000001',
            'image_path' => 'seeded/report-01.png',
            'predicted_label' => Report::LABEL_SMUT,
            'confidence' => 0.7312345,
            'model_version' => 'v1.0-mobilenetv2',
            'review_status' => Report::STATUS_RESOLVED,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_DOWNY_MILDEW,
        ]);
        DB::table('report_class_scores')->where('report_id', $report->id)->delete();
        DB::table('report_symptoms')->where('report_id', $report->id)->delete();
        $originalReport = (array) DB::table('reports')
            ->where('id', $report->id)
            ->first();

        $this->seed(DatabaseSeeder::class);

        $this->assertSame(
            $originalReport,
            (array) DB::table('reports')->where('id', $report->id)->first(),
        );
        $this->assertSame(4, DB::table('report_class_scores')
            ->where('report_id', $report->id)
            ->count());
        $this->assertDatabaseHas('report_symptoms', [
            'report_id' => $report->id,
            'symptom_key' => Report::LABEL_SMUT,
        ]);
        $this->assertTrue(Storage::disk('local')->exists('seeded/report-01.png'));
        $this->assertSame(12, Report::query()->count());
    }

    public function test_seeder_creates_twelve_varied_reports_with_valid_images(): void
    {
        Storage::fake('local');
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
        ]);

        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount('reports', 12);
        $this->assertSame(2, Report::query()
            ->whereNotNull('final_latitude')
            ->whereNotNull('final_longitude')
            ->count());
        $this->assertSame(10, Report::query()
            ->where(function ($query) {
                $query
                    ->whereNull('final_latitude')
                    ->orWhereNull('final_longitude');
            })
            ->count());
        $locatedDemoReport = Report::query()
            ->where('reference_code', 'CG-2026-0002')
            ->firstOrFail();
        $this->assertSame('14.0667000', $locatedDemoReport->final_latitude);
        $this->assertSame('120.6319000', $locatedDemoReport->final_longitude);
        $this->assertSame('gps', $locatedDemoReport->location_source);
        $manualDemoReport = Report::query()
            ->where('reference_code', 'CG-2026-0007')
            ->firstOrFail();
        $this->assertSame('14.0710000', $manualDemoReport->final_latitude);
        $this->assertSame('120.6350000', $manualDemoReport->final_longitude);
        $this->assertSame('manual_map', $manualDemoReport->location_source);
        $this->assertNull($manualDemoReport->gps_accuracy);
        $this->assertDatabaseCount('report_class_scores', 48);
        $this->assertSame(Report::v2Labels(), Report::query()
            ->distinct()
            ->orderBy('predicted_label')
            ->pluck('predicted_label')
            ->sort()
            ->values()
            ->all());
        $this->assertDatabaseHas('reports', [
            'predicted_label' => Report::LABEL_SMUT,
            'model_version' => 'v1.0-mobilenetv2',
        ]);
        $expectedStatuses = Report::reviewStatuses();
        sort($expectedStatuses);

        $this->assertSame($expectedStatuses, Report::query()
            ->distinct()
            ->pluck('review_status')
            ->sort()
            ->values()
            ->all());
        $this->assertSame(
            Report::lifecycleForReviewStatus(Report::STATUS_SUBMITTED_UNVERIFIED),
            Report::query()
                ->where('review_status', Report::STATUS_SUBMITTED_UNVERIFIED)
                ->firstOrFail()
                ->lifecycleSnapshot(),
        );
        $this->assertSame(
            Report::lifecycleForReviewStatus(Report::STATUS_VERIFIED_BY_STAFF),
            Report::query()
                ->where('review_status', Report::STATUS_VERIFIED_BY_STAFF)
                ->firstOrFail()
                ->lifecycleSnapshot(),
        );
        $this->assertSame(
            Report::lifecycleForReviewStatus(Report::STATUS_RESOLVED),
            Report::query()
                ->where('review_status', Report::STATUS_RESOLVED)
                ->firstOrFail()
                ->lifecycleSnapshot(),
        );

        $files = Storage::disk('local')->allFiles('seeded');
        $this->assertCount(12, $files);
        $seededImage = Storage::disk('local')->get($files[0]);
        $dimensions = getimagesizefromstring($seededImage);
        $this->assertNotFalse($dimensions);
        $this->assertGreaterThanOrEqual(512, $dimensions[0]);
        $this->assertGreaterThanOrEqual(512, $dimensions[1]);
        $this->assertGreaterThan(10_000, strlen($seededImage));
        $this->assertSame(
            4,
            ReportClassScore::query()
                ->where('report_id', Report::query()->firstOrFail()->id)
                ->count(),
        );
    }
}
