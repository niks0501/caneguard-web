<?php

namespace Tests\Feature;

use App\Models\Advisory;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Database\Seeders\AdvisorDemoSeeder;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdvisorDemoSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.demo_users.expert_password' => 'expert-test-password',
        ]);
        Storage::fake('local');
    }

    public function test_demo_dataset_covers_the_new_api_surfaces_and_is_idempotent(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount(
            'reports',
            12 + count(AdvisorDemoSeeder::demoReportReferences()),
        );
        $this->assertDatabaseCount('advisories', 1);
        $this->assertDatabaseCount('report_referrals', 2);
        $this->assertDatabaseCount('field_validation_assignments', 3);
        $this->assertDatabaseCount('field_validation_completions', 2);
        $this->assertDatabaseCount('report_review_events', 1);

        $scheduled = Report::query()->where('reference_code', 'DEMO-CG-01')->firstOrFail();
        $this->assertSame('Demo Farm Alpha', $scheduled->farmer_or_farm_owner_name);
        $this->assertSame(Report::REPORTER_CONCERN_RSSI, $scheduled->reporter_suspected_condition);
        $this->assertSame(
            '2026-09-24',
            $scheduled->fieldValidationAssignment->target_visit_date?->format('Y-m-d'),
        );

        $photoReport = Report::query()->where('reference_code', 'DEMO-CG-02')->firstOrFail();
        $completion = $photoReport->fieldValidationAssignment?->completion;
        $this->assertNotNull($completion);
        $this->assertSame('improved', $completion->follow_up_outcome);
        Storage::disk('local')->assertExists('field-validation/demo-cg-02.png');

        $consult = ReportReferral::query()
            ->where('reference', 'CONSULT-DEMO-03')
            ->firstOrFail();
        $this->assertSame(
            User::query()->where('email', 'expert@caneguard.test')->value('id'),
            $consult->expert_id,
        );
        $this->assertSame(ReportReferral::STATUS_COMPLETED, $consult->consult_status);
        $this->assertSame('2026-09-14', $consult->response_date?->format('Y-m-d'));
        $this->assertNotNull($consult->response_finding);

        $advisory = Advisory::query()->where('code', AdvisorDemoSeeder::DEMO_ADVISORY_CODE)->firstOrFail();
        $this->assertSame(Advisory::STATUS_VALIDATED, $advisory->status);
        $this->assertSame(
            $advisory->getKey(),
            Report::query()->where('reference_code', 'DEMO-CG-05')->value('advisory_id'),
        );
        $this->assertSame(
            Report::ADVISORY_DELIVERY_DELIVERED,
            Report::query()->where('reference_code', 'DEMO-CG-05')->value('advisory_delivery_state'),
        );

        $unavailable = Report::query()->where('reference_code', 'DEMO-CG-07')->firstOrFail();
        $this->assertSame(Report::LOCATION_SOURCE_UNAVAILABLE, $unavailable->location_source);
        $this->assertSame(
            Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
            $unavailable->location_unavailable_reason,
        );
        $this->assertSame('v1.0-mobilenetv2', $unavailable->model_version);
        $this->assertNull($unavailable->final_latitude);
        $this->assertNull($unavailable->final_longitude);

        $reviewer = User::query()->where('email', 'mao@caneguard.test')->firstOrFail();
        Sanctum::actingAs($reviewer);
        $this->getJson('/api/v1/reports/summary?month=2026-09')
            ->assertOk()
            ->assertJsonPath('data.expert_verification.consult_volume.total', 2)
            ->assertJsonPath('data.expert_verification.consult_volume.completed', 1)
            ->assertJsonPath('data.expert_verification.advisory_coverage.cases_with_advisory', 1)
            ->assertJsonPath('data.expert_verification.advisory_coverage.delivered_cases', 1)
            ->assertJsonPath('data.expert_verification.expert_agreement.count', 1);

        $this->getJson("/api/v1/reports/{$photoReport->uuid}/validation-photo")
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=300, private')
            ->assertHeader('X-Content-Type-Options', 'nosniff');

        $expert = User::query()->where('email', 'expert@caneguard.test')->firstOrFail();
        Sanctum::actingAs($expert);
        $this->getJson('/api/v1/reports/expert-queue')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.reference_code', 'DEMO-CG-04')
            ->assertJsonPath('data.0.expert_consult.status', ReportReferral::STATUS_PENDING)
            ->assertJsonPath('data.0.expert_consult.due_date', '2026-09-26');
    }

    public function test_cleanup_removes_only_demo_rows_and_files(): void
    {
        $this->seed(DatabaseSeeder::class);

        AdvisorDemoSeeder::cleanup();

        $this->assertDatabaseCount('reports', 12);
        $this->assertDatabaseCount('advisories', 0);
        $this->assertDatabaseCount('report_referrals', 0);
        $this->assertDatabaseCount('field_validation_assignments', 0);
        $this->assertDatabaseCount('field_validation_completions', 0);
        $this->assertDatabaseCount('report_review_events', 0);
        $this->assertDatabaseHas('reports', ['reference_code' => 'CG-2026-0001']);
        $this->assertDatabaseMissing('reports', ['reference_code' => 'DEMO-CG-01']);
        Storage::disk('local')->assertExists('seeded/report-01.png');
        Storage::disk('local')->assertMissing('seeded/demo-report-01.png');
        Storage::disk('local')->assertMissing('field-validation/demo-cg-02.png');
    }
}
