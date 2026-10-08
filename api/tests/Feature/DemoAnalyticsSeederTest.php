<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoAnalyticsSeeder;
use Database\Seeders\OfficeAdvisorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DemoAnalyticsSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_analytics_seeder_restores_missing_dashboard_image_from_tracked_asset(): void
    {
        Storage::fake('local');
        $this->configureDemoPasswords();

        $this->seedAnalyticsPrerequisites();
        $this->seed(DemoAnalyticsSeeder::class);

        $report = Report::query()
            ->where('reference_code', DemoAnalyticsSeeder::REFERENCE_PREFIX.'0001')
            ->firstOrFail();
        $imagePath = $report->image_path;
        $sourceImage = file_get_contents(database_path('seeders/assets/synthetic-sugarcane-rust.png'));
        $this->assertIsString($sourceImage);
        $this->assertSame($sourceImage, Storage::disk('local')->get($imagePath));

        Storage::disk('local')->delete($imagePath);
        $this->assertFalse(Storage::disk('local')->exists($imagePath));

        $this->seed(DemoAnalyticsSeeder::class);

        Storage::disk('local')->assertExists($imagePath);
        $this->assertSame($sourceImage, Storage::disk('local')->get($imagePath));
        Sanctum::actingAs(User::query()->where('email', 'mao@caneguard.test')->firstOrFail());
        $response = $this->get("/api/v1/reports/{$report->uuid}/image")
            ->assertOk()
            ->assertHeader('content-type', 'image/png');
        $this->assertSame($sourceImage, $response->streamedContent());
    }

    public function test_analytics_seed_is_idempotent_and_feeds_public_report_surfaces(): void
    {
        CarbonImmutable::setTestNow('2026-09-24T12:00:00Z');
        Storage::fake('local');
        $this->configureDemoPasswords();

        try {
            $this->seedAnalyticsPrerequisites();
            $this->seed(DemoAnalyticsSeeder::class);
            Sanctum::actingAs(User::query()->where('email', 'mao@caneguard.test')->firstOrFail());
            $reports = $this->getJson('/api/v1/reports?per_page=100')->assertOk();
            $total = $reports->json('meta.total');
            $this->assertGreaterThan(0, $total);

            $this->seed(DemoAnalyticsSeeder::class);

            $this->getJson('/api/v1/reports?per_page=100')
                ->assertOk()
                ->assertJsonPath('meta.total', $total);
            $dashboard = $this->getJson('/api/v1/dashboard/summary?month=2026-09&include=counts,queues,recent,monthly')
                ->assertOk()
                ->assertJsonPath('data.counts.total_submitted', $total)
                ->assertJsonPath('data.monthly_summary.month', '2026-09');
            $this->assertGreaterThan(0, $dashboard->json('data.monthly_summary.reported_cases'));

            $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => '2026-05-01',
                'to' => '2026-09-30',
                'granularity' => 'week',
            ]))
                ->assertOk()
                ->assertJsonPath('data.total_submitted', $total);

            $this->getJson('/api/v1/reports/map')
                ->assertOk()
                ->assertJsonPath('type', 'FeatureCollection')
                ->assertJsonPath('metadata.total_count', $total);

            $document = $this->get('/api/v1/reports/documents/report?period_type=custom&from=2026-05-01&to=2026-09-30')
                ->assertOk();
            $this->assertStringNotContainsString('No submitted reports in this period.', $document->getContent());
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    private function seedAnalyticsPrerequisites(): void
    {
        foreach ([
            'field@caneguard.test' => User::ROLE_FIELD_REPORTER,
            'mao@caneguard.test' => User::ROLE_REVIEWER,
            'admin@caneguard.test' => User::ROLE_ADMIN,
        ] as $email => $role) {
            User::factory()->inDistrict($this->pilotDistrict())->create(['email' => $email, 'role' => $role]);
        }
        $this->seed(OfficeAdvisorySeeder::class);
    }

    private function configureDemoPasswords(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => 'test-pilot',
        ]);
    }
}
