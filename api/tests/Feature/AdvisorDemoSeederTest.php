<?php

namespace Tests\Feature;

use App\Contracts\MobileFieldValidationAssignmentContract;
use App\Contracts\MobileFieldValidationCompletionContract;
use App\Models\Advisory;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Database\Seeders\AdvisorDemoSeeder;
use Database\Seeders\DashboardReportSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\ReportSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
        $this->seedReportDemoDataset();
        $this->seedReportDemoDataset();

        $this->assertDatabaseCount(
            'reports',
            12
                + count(AdvisorDemoSeeder::reportReferences())
                + count(DashboardReportSeeder::reportReferences()),
        );
        $this->assertDatabaseCount('advisories', 1);
        $this->assertGreaterThan(4, ReportReferral::query()->count());
        $this->assertGreaterThan(4, DB::table('field_validation_assignments')->count());
        $this->assertGreaterThan(2, DB::table('field_validation_completions')->count());
        $this->assertDatabaseCount('report_review_events', 1);

        $scheduled = Report::query()->where('reference_code', 'BGO-20260920-0810')->firstOrFail();
        $this->assertSame('Rogelio Manalo', $scheduled->farmer_or_farm_owner_name);
        $this->assertSame(Report::REPORTER_CONCERN_RSSI, $scheduled->reporter_suspected_condition);
        $this->assertSame(
            '2026-09-19',
            $scheduled->fieldValidationAssignment->target_visit_date?->format('Y-m-d'),
        );

        $photoReport = Report::query()->where('reference_code', 'BGO-20260916-0745')->firstOrFail();
        $completion = $photoReport->fieldValidationAssignment?->completion;
        $this->assertNotNull($completion);
        $this->assertSame('improved', $completion->follow_up_outcome);
        Storage::disk('local')->assertExists('field-validation/2026-09-18-balaytigui.png');

        $consult = ReportReferral::query()
            ->where('reference', 'BGO-CONSULT-20260910')
            ->firstOrFail();
        $this->assertSame(
            User::query()->where('email', 'expert@caneguard.test')->value('id'),
            $consult->expert_id,
        );
        $this->assertSame(ReportReferral::STATUS_COMPLETED, $consult->consult_status);
        $this->assertSame('2026-09-14', $consult->response_date?->format('Y-m-d'));
        $this->assertNotNull($consult->response_finding);

        $advisory = Advisory::query()->where('code', AdvisorDemoSeeder::ADVISORY_CODE)->firstOrFail();
        $this->assertSame(Advisory::STATUS_VALIDATED, $advisory->status);
        $this->assertSame(
            $advisory->getKey(),
            Report::query()->where('reference_code', 'BGO-20260912-0900')->value('advisory_id'),
        );
        $this->assertSame(
            Report::ADVISORY_DELIVERY_DELIVERED,
            Report::query()->where('reference_code', 'BGO-20260912-0900')->value('advisory_delivery_state'),
        );

        $unavailable = Report::query()->where('reference_code', 'BGO-20260918-0615')->firstOrFail();
        $this->assertSame('Dayap', $unavailable->barangay);
        $this->assertSame('Batangas', $unavailable->province);
        $this->assertSame('Nasugbu', $unavailable->municipality);
        $this->assertSame(Report::LOCATION_SOURCE_UNAVAILABLE, $unavailable->location_source);
        $this->assertSame(
            Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
            $unavailable->location_unavailable_reason,
        );
        $this->assertSame('v1.0-mobilenetv2', $unavailable->model_version);
        $this->assertNull($unavailable->final_latitude);
        $this->assertNull($unavailable->final_longitude);

        $fieldReporter = User::query()->where('email', 'field@caneguard.test')->firstOrFail();
        Sanctum::actingAs($fieldReporter, ['assignment:read']);
        $assignmentContract = MobileFieldValidationAssignmentContract::definition();
        $assignmentResponse = $this->getJson('/api/v1/mobile/assignments')->assertOk();
        $assignmentPayload = $assignmentResponse->json();
        foreach ($assignmentContract['envelope']['required_keys'] as $key) {
            $this->assertArrayHasKey($key, $assignmentPayload);
        }
        $mobileAssignments = $assignmentPayload['data'];
        $this->assertNotEmpty($mobileAssignments);
        $this->assertSame(array_keys($assignmentContract['fields']), array_keys($mobileAssignments[0]));

        $allowedFollowUpOutcomes = MobileFieldValidationCompletionContract::field(
            'follow_up_outcome',
        )['enum'];
        $this->assertSame(
            $assignmentContract['fields']['previous_visit']['properties']['follow_up_outcome']['enum'],
            $allowedFollowUpOutcomes,
        );
        $previousVisits = array_filter(array_column($mobileAssignments, 'previous_visit'));
        foreach ($previousVisits as $previousVisit) {
            if ($previousVisit['follow_up_outcome'] !== null) {
                $this->assertContains($previousVisit['follow_up_outcome'], $allowedFollowUpOutcomes);
            }
        }

        $reviewer = User::query()->where('email', 'mao@caneguard.test')->firstOrFail();
        Sanctum::actingAs($reviewer);
        $summary = $this->getJson('/api/v1/reports/summary?month=2026-09')
            ->assertOk();
        $this->assertGreaterThan(
            2,
            $summary->json('data.expert_verification.consult_volume.total'),
        );
        $this->assertGreaterThan(
            1,
            $summary->json('data.expert_verification.consult_volume.completed'),
        );
        $this->assertGreaterThanOrEqual(
            1,
            $summary->json('data.expert_verification.advisory_coverage.cases_with_advisory'),
        );
        $this->assertGreaterThanOrEqual(
            1,
            $summary->json('data.expert_verification.advisory_coverage.delivered_cases'),
        );
        $this->assertGreaterThanOrEqual(
            1,
            $summary->json('data.expert_verification.expert_agreement.count'),
        );

        $this->getJson("/api/v1/reports/{$photoReport->uuid}/validation-photo")
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=300, private')
            ->assertHeader('X-Content-Type-Options', 'nosniff');

        $expert = User::query()->where('email', 'expert@caneguard.test')->firstOrFail();
        Sanctum::actingAs($expert);
        $this->getJson('/api/v1/reports/expert-queue')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.reference_code', 'BGO-20260919-0820')
            ->assertJsonPath('data.0.expert_consult.status', ReportReferral::STATUS_PENDING)
            ->assertJsonPath('data.0.expert_consult.due_date', '2026-09-26');
    }

    public function test_cleanup_removes_only_demo_rows_and_files(): void
    {
        $this->seedReportDemoDataset();

        AdvisorDemoSeeder::cleanup();

        $this->assertDatabaseCount(
            'reports',
            12 + count(DashboardReportSeeder::reportReferences()),
        );
        $this->assertDatabaseCount('advisories', 0);
        $this->assertGreaterThan(2, ReportReferral::query()->count());
        $this->assertGreaterThan(0, DB::table('field_validation_assignments')->count());
        $this->assertGreaterThan(0, DB::table('field_validation_completions')->count());
        $this->assertDatabaseCount('report_review_events', 0);
        $this->assertDatabaseHas('reports', ['reference_code' => 'BGO-20260702-0915']);
        $this->assertDatabaseMissing('reports', ['reference_code' => 'BGO-20260920-0810']);
        Storage::disk('local')->assertExists('reports/2026-07/bgo-20260702-0915.png');
        Storage::disk('local')->assertMissing('reports/2026-09/bgo-20260920-0810.png');
        Storage::disk('local')->assertMissing('field-validation/2026-09-18-balaytigui.png');
    }

    private function seedReportDemoDataset(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(ReportSeeder::class);
        $this->seed(AdvisorDemoSeeder::class);
        $this->seed(DashboardReportSeeder::class);
    }
}
