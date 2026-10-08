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
            foreach (Report::operationalQueues() as $queue) {
                $this->assertGreaterThan(0, $dashboard->json("data.queues.{$queue}"), $queue);
            }

            $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => '2026-05-01',
                'to' => '2026-09-30',
                'granularity' => 'week',
            ]))->assertOk();
            $rangeStart = CarbonImmutable::parse('2026-05-01', 'Asia/Manila')->startOfDay()->utc();
            $rangeEnd = CarbonImmutable::parse('2026-09-30', 'Asia/Manila')->endOfDay()->utc();
            $rangeCount = Report::query()->whereBetween('submitted_at', [$rangeStart, $rangeEnd])->count();
            $analytics->assertJsonPath('data.total_submitted', $rangeCount);
            $analyticsPayload = json_decode($analytics->getContent(), false, 512, JSON_THROW_ON_ERROR);
            $this->assertIsObject($analyticsPayload->data->filters);
            $this->assertSame([], (array) $analyticsPayload->data->filters);

            $filteredCount = Report::query()
                ->whereBetween('submitted_at', [$rangeStart, $rangeEnd])
                ->where('review_status', Report::STATUS_FOR_FIELD_VALIDATION)
                ->whereHas('fieldValidationAssignment.completion', fn ($query) => $query->where('follow_up_outcome', 'worsened'))
                ->count();
            $filteredAnalytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => '2026-05-01',
                'to' => '2026-09-30',
                'granularity' => 'week',
                'status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'follow_up_outcome' => 'worsened',
            ]))->assertOk()->assertJsonPath('data.total_submitted', $filteredCount);
            $filteredPayload = json_decode($filteredAnalytics->getContent(), false, 512, JSON_THROW_ON_ERROR);
            $this->assertIsObject($filteredPayload->data->filters);
            $this->assertSame(Report::STATUS_FOR_FIELD_VALIDATION, $filteredPayload->data->filters->status);
            $this->assertSame('worsened', $filteredPayload->data->filters->follow_up_outcome);

            $improvedCount = Report::query()
                ->whereHas('fieldValidationAssignment.completion', fn ($query) => $query->where('follow_up_outcome', 'improved'))
                ->count();
            $this->getJson('/api/v1/reports?follow_up_outcome=improved&per_page=100')
                ->assertOk()
                ->assertJsonPath('meta.total', $improvedCount);

            $mapReports = Report::query()->where('review_status', Report::STATUS_SUBMITTED_UNVERIFIED)->get();
            $locatedCount = $mapReports->filter(fn (Report $report): bool => $report->final_latitude !== null && $report->final_longitude !== null)->count();
            $map = $this->getJson('/api/v1/reports/map?status='.Report::STATUS_SUBMITTED_UNVERIFIED)->assertOk();
            $map->assertJsonPath('metadata.total_count', $mapReports->count())
                ->assertJsonPath('metadata.located_count', $locatedCount)
                ->assertJsonPath('metadata.unlocated_count', $mapReports->count() - $locatedCount)
                ->assertJsonCount($locatedCount, 'features');

            foreach (['needs_visit', 'follow_up_due', 'upcoming'] as $queue) {
                $queueResponse = $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
                    'queue' => $queue,
                    'limit' => 50,
                ]))->assertOk();
                $this->assertSame(count($queueResponse->json('data.items')), $queueResponse->json('data.count'));
                $this->assertGreaterThan(0, $queueResponse->json('data.count'));
            }

            $detail = Report::query()->withCount('classScores')->firstOrFail();
            $this->getJson('/api/v1/reports/'.$detail->uuid)
                ->assertOk()
                ->assertJsonPath('data.identity.uuid', $detail->uuid)
                ->assertJsonPath('data.model.predicted_label', $detail->predicted_label)
                ->assertJsonCount($detail->class_scores_count, 'data.model.class_scores');

            $document = $this->get('/api/v1/reports/documents/report?'.http_build_query([
                'period_type' => 'custom',
                'from' => '2026-05-01',
                'to' => '2026-09-30',
                'appendix' => true,
            ]))->assertOk();
            $this->assertStringContainsString('class="metric-value">'.$rangeCount.'</span>', $document->getContent());
            $this->assertStringContainsString(DemoAnalyticsSeeder::REFERENCE_PREFIX, $document->getContent());

            $monthStart = CarbonImmutable::parse('2026-09-01', 'Asia/Manila')->startOfDay()->utc();
            $monthEnd = CarbonImmutable::parse('2026-09-30', 'Asia/Manila')->endOfDay()->utc();
            $monthCount = Report::query()->whereBetween('submitted_at', [$monthStart, $monthEnd])->count();
            $monthlyDocument = $this->get('/api/v1/reports/documents/report?period_type=monthly&month=2026-09&appendix=1')
                ->assertOk();
            $this->assertStringContainsString('class="metric-value">'.$monthCount.'</span>', $monthlyDocument->getContent());
            $this->assertStringContainsString(DemoAnalyticsSeeder::REFERENCE_PREFIX, $monthlyDocument->getContent());
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
