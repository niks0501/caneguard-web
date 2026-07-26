<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\ReportClassScore;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
            'barangay',
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
            'review_notes',
            'reviewer_id',
            'reviewed_at',
            'lock_version',
        ]));
        $this->assertTrue(Schema::hasTable('report_class_scores'));
        $this->assertTrue(Schema::hasTable('report_symptoms'));
        $this->assertTrue(Schema::hasTable('report_quality_warnings'));
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
        $this->assertDatabaseCount('report_class_scores', 36);
        $this->assertSame(Report::labels(), Report::query()
            ->distinct()
            ->orderBy('predicted_label')
            ->pluck('predicted_label')
            ->sort()
            ->values()
            ->all());
        $expectedStatuses = Report::reviewStatuses();
        sort($expectedStatuses);

        $this->assertSame($expectedStatuses, Report::query()
            ->distinct()
            ->pluck('review_status')
            ->sort()
            ->values()
            ->all());

        $files = Storage::disk('local')->allFiles('seeded');
        $this->assertCount(12, $files);
        $this->assertNotFalse(
            getimagesizefromstring(Storage::disk('local')->get($files[0])),
        );
        $this->assertSame(
            3,
            ReportClassScore::query()
                ->where('report_id', Report::query()->firstOrFail()->id)
                ->count(),
        );
    }
}
