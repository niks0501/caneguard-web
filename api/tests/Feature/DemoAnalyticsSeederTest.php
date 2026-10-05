<?php

namespace Tests\Feature;

use App\Contracts\MobileFieldValidationCompletionContract;
use App\Contracts\MobileReportUploadV2Contract;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\DashboardReportSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoAnalyticsSeeder;
use Database\Seeders\OfficeAdvisorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DemoAnalyticsSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_seed_includes_the_analytics_reports(): void
    {
        Storage::fake('local');
        $this->configureDemoPasswords();

        $this->seed(DatabaseSeeder::class);

        $this->assertSame(DemoAnalyticsSeeder::REPORT_COUNT, Report::query()
            ->where('reference_code', 'like', DemoAnalyticsSeeder::REFERENCE_PREFIX.'%')->count());
    }

    public function test_analytics_seeder_restores_missing_dashboard_image_from_tracked_asset(): void
    {
        Storage::fake('local');
        $this->configureDemoPasswords();

        $this->seedAnalyticsPrerequisites();
        $this->seed(DemoAnalyticsSeeder::class);

        $report = Report::query()
            ->where('reference_code', DemoAnalyticsSeeder::REFERENCE_PREFIX.'0001')
            ->firstOrFail();
        $imagePath = 'reports/demo-analytics/synthetic-field-evidence.png';
        $sourceImage = file_get_contents(database_path('seeders/assets/synthetic-sugarcane-rust.png'));
        $this->assertIsString($sourceImage);
        $this->assertSame($imagePath, $report->image_path);
        $this->assertSame($sourceImage, Storage::disk('local')->get($imagePath));

        Storage::disk('local')->delete($imagePath);
        $this->assertFalse(Storage::disk('local')->exists($imagePath));

        $this->seed(DemoAnalyticsSeeder::class);

        $this->approveSeededPilotFixtures();
        Storage::disk('local')->assertExists($imagePath);
        $this->assertSame($sourceImage, Storage::disk('local')->get($imagePath));
        Sanctum::actingAs(User::query()->where('email', 'mao@caneguard.test')->firstOrFail());
        $response = $this->get("/api/v1/reports/{$report->uuid}/image")
            ->assertOk()
            ->assertHeader('content-type', 'image/png');
        $this->assertSame($sourceImage, $response->streamedContent());
    }

    public function test_analytics_dataset_matches_mobile_contract_and_feeds_report_surfaces(): void
    {
        CarbonImmutable::setTestNow('2026-09-24T12:00:00Z');
        Storage::fake('local');
        $this->configureDemoPasswords();

        try {
            $this->seedAnalyticsPrerequisites();
            $this->assertDatabaseCount('reports', 0);

            $this->seed(DemoAnalyticsSeeder::class);
            $this->seed(DemoAnalyticsSeeder::class);
            $this->approveSeededPilotFixtures();

            $reports = Report::query()
                ->where('reference_code', 'like', DemoAnalyticsSeeder::REFERENCE_PREFIX.'%')
                ->with(['classScores', 'symptoms'])
                ->orderBy('reference_code')
                ->get();
            $this->assertCount(DemoAnalyticsSeeder::REPORT_COUNT, $reports);
            $this->assertDatabaseCount('reports', DemoAnalyticsSeeder::REPORT_COUNT);
            $this->assertDatabaseCount('report_class_scores', DemoAnalyticsSeeder::REPORT_COUNT * 4);
            $this->assertDatabaseCount('field_validation_assignments', 10);
            $this->assertDatabaseCount('field_validation_completions', 5);
            $this->assertDatabaseCount('report_referrals', 0);

            $upload = MobileReportUploadV2Contract::definition()['fields'];
            $allowedLabels = $upload['predicted_label']['enum'];
            $allowedStatuses = Report::reviewStatuses();
            $allowedOutcomes = MobileFieldValidationCompletionContract::field('follow_up_outcome')['enum'];
            $barangays = DashboardReportSeeder::BARANGAY_COORDINATES;
            $monthCounts = [];
            $statusCounts = array_fill_keys($allowedStatuses, 0);
            $seenLabels = [];
            $seenBarangays = [];
            $seenValidationStates = [];

            foreach ($reports as $report) {
                $this->assertTrue(Str::isUuid($report->client_uuid));
                $this->assertContains($report->predicted_label, $allowedLabels);
                $this->assertContains($report->review_status, $allowedStatuses);
                $this->assertContains($report->barangay, array_keys($barangays));
                $this->assertSame('Batangas', $report->province);
                $this->assertSame('Nasugbu', $report->municipality);
                $this->assertStringStartsWith('Demo Grower ', $report->farmer_or_farm_owner_name);
                $this->assertStringContainsString('Synthetic demo', $report->reporter_observation_text);
                $this->assertSame('v1.0-mobilenetv2', $report->model_version);
                $this->assertContains($report->image_source_type, $upload['image_source_type']['enum']);
                $this->assertSame('image/png', $report->image_mime_type);
                $this->assertLessThanOrEqual($upload['image']['max_bytes'], $report->image_size_bytes);
                $this->assertGreaterThan(0, $report->source_width);
                $this->assertGreaterThan(0, $report->source_height);
                $this->assertTrue(Storage::disk('local')->exists($report->image_path));

                $scores = $report->classScores->sortBy('label')->values();
                $this->assertCount(4, $scores);
                $this->assertSame($allowedLabels, $scores->pluck('label')->sort()->values()->all());
                $this->assertEqualsWithDelta(
                    1.0,
                    $scores->sum(fn ($score): float => (float) $score->score),
                    0.000001,
                );
                $this->assertSame(
                    [$report->predicted_label === Report::LABEL_HEALTHY ? 'none' : $report->predicted_label],
                    $report->symptoms->pluck('symptom_key')->all(),
                );

                if ($report->location_source === Report::LOCATION_SOURCE_UNAVAILABLE) {
                    $this->assertNull($report->final_latitude);
                    $this->assertNull($report->final_longitude);
                    $this->assertContains($report->location_unavailable_reason, $upload['location_unavailable_reason']['enum']);
                } else {
                    $this->assertNotNull($report->final_latitude);
                    $this->assertNotNull($report->final_longitude);
                    $this->assertEqualsWithDelta(
                        $barangays[$report->barangay]['latitude'],
                        (float) $report->final_latitude,
                        0.000001,
                    );
                    $this->assertEqualsWithDelta(
                        $barangays[$report->barangay]['longitude'],
                        (float) $report->final_longitude,
                        0.000001,
                    );
                }

                $statusCounts[$report->review_status]++;
                $seenLabels[$report->predicted_label] = true;
                $seenBarangays[$report->barangay] = true;
                $seenValidationStates[$report->field_validation_state] = true;
                $month = $report->submitted_at->timezone('Asia/Manila')->format('Y-m');
                $monthCounts[$month] = ($monthCounts[$month] ?? 0) + 1;
            }

            $expectedMonths = [];
            for ($offset = 0; $offset < 5; $offset++) {
                $expectedMonths[] = CarbonImmutable::now('Asia/Manila')->startOfMonth()->subMonths($offset)->format('Y-m');
            }
            sort($expectedMonths);
            ksort($monthCounts);
            $this->assertSame($expectedMonths, array_keys($monthCounts));
            $this->assertSame(array_fill(0, 5, 10), array_values($monthCounts));
            $this->assertSame(array_fill_keys($allowedStatuses, 10), $statusCounts);
            $this->assertSame($allowedLabels, array_keys(array_intersect_key(array_flip($allowedLabels), $seenLabels)));
            $this->assertCount(12, $seenBarangays);
            $this->assertSame([
                Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                Report::FIELD_VALIDATION_STATE_ASSIGNED,
                Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
                Report::FIELD_VALIDATION_STATE_COMPLETED,
            ], array_values(array_intersect(
                Report::fieldValidationStates(),
                array_keys($seenValidationStates),
            )));

            $completionOutcomes = \DB::table('field_validation_completions')
                ->pluck('follow_up_outcome')
                ->all();
            $this->assertSame($allowedOutcomes, array_values(array_unique($completionOutcomes)));
            $actions = array_filter($reports->pluck('action_taken')->all());
            $this->assertNotContains(Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED, $actions);
            $this->assertContains(Report::ACTION_ADVISORY_PROVIDED, $actions);
            $this->assertNotContains(Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION, $actions);
            $this->assertContains(Report::ACTION_NO_FURTHER_ACTION_REQUIRED, $actions);
            $advisoryCases = $reports->where('action_taken', Report::ACTION_ADVISORY_PROVIDED);
            $this->assertCount(15, $advisoryCases);
            $this->assertCount(15, $reports->filter(fn (Report $report): bool => $report->advisory_id !== null));

            $reporter = User::query()->where('email', 'field@caneguard.test')->firstOrFail();
            $reviewer = User::query()->where('email', 'mao@caneguard.test')->firstOrFail();
            $admin = User::query()->where('email', 'admin@caneguard.test')->firstOrFail();
            $this->assertSame([$reporter->getKey()], $reports->pluck('reporter_id')->unique()->values()->all());
            $this->assertContains($reviewer->getKey(), $reports->pluck('reviewer_id')->all());
            $this->assertContains($admin->getKey(), $reports->pluck('reviewer_id')->all());
            Sanctum::actingAs($reviewer);

            $this->getJson('/api/v1/reports?per_page=100')
                ->assertOk()
                ->assertJsonPath('meta.total', DemoAnalyticsSeeder::REPORT_COUNT)
                ->assertJsonCount(DemoAnalyticsSeeder::REPORT_COUNT, 'data');

            $dashboard = $this->getJson('/api/v1/dashboard/summary?month=2026-09&include=counts,queues,recent,monthly')
                ->assertOk()
                ->assertJsonPath('data.counts.total_submitted', DemoAnalyticsSeeder::REPORT_COUNT)
                ->assertJsonPath('data.monthly_summary.month', '2026-09')
                ->assertJsonPath('data.monthly_summary.reported_cases', 10);
            foreach (Report::operationalQueues() as $queue) {
                $this->assertGreaterThan(0, $dashboard->json("data.queues.{$queue}"), $queue);
            }

            $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => '2026-05-01',
                'to' => '2026-09-30',
                'granularity' => 'week',
            ]))
                ->assertOk()
                ->assertJsonPath('data.total_submitted', DemoAnalyticsSeeder::REPORT_COUNT)
                ->assertJsonCount(12, 'data.cases_by_barangay')
                ->assertJsonCount(4, 'data.cases_by_possible_condition');
            $analyticsPayload = json_decode($analytics->getContent(), false, 512, JSON_THROW_ON_ERROR);
            $this->assertIsObject($analyticsPayload->data->filters);
            $this->assertSame([], (array) $analyticsPayload->data->filters);

            $filteredAnalytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => '2026-05-01',
                'to' => '2026-09-30',
                'granularity' => 'week',
                'status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'follow_up_outcome' => 'worsened',
            ]))
                ->assertOk()
                ->assertJsonPath('data.total_submitted', 1);
            $filteredPayload = json_decode($filteredAnalytics->getContent(), false, 512, JSON_THROW_ON_ERROR);
            $this->assertIsObject($filteredPayload->data->filters);
            $this->assertSame(Report::STATUS_FOR_FIELD_VALIDATION, $filteredPayload->data->filters->status);
            $this->assertSame('worsened', $filteredPayload->data->filters->follow_up_outcome);

            $this->getJson('/api/v1/reports?follow_up_outcome=improved&per_page=100')
                ->assertOk()
                ->assertJsonPath('meta.total', 2);

            $this->getJson('/api/v1/reports/map?status='.Report::STATUS_SUBMITTED_UNVERIFIED)
                ->assertOk()
                ->assertJsonPath('metadata.total_count', 10)
                ->assertJsonPath('metadata.located_count', 9)
                ->assertJsonPath('metadata.unlocated_count', 1)
                ->assertJsonCount(9, 'features');

            foreach (['needs_visit' => 5, 'follow_up_due' => 4, 'upcoming' => 1] as $queue => $expectedCount) {
                $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
                    'queue' => $queue,
                    'limit' => 50,
                ]))
                    ->assertOk()
                    ->assertJsonPath('data.count', $expectedCount)
                    ->assertJsonCount($expectedCount, 'data.items');
            }

            $detail = $reports->first();
            $this->getJson('/api/v1/reports/'.$detail->uuid)
                ->assertOk()
                ->assertJsonPath('data.identity.uuid', $detail->uuid)
                ->assertJsonPath('data.model.predicted_label', $detail->predicted_label)
                ->assertJsonCount(4, 'data.model.class_scores');

            $document = $this->get('/api/v1/reports/documents/report?'.http_build_query([
                'period_type' => 'custom',
                'from' => '2026-05-01',
                'to' => '2026-09-30',
                'appendix' => true,
            ]))->assertOk();
            $this->assertStringContainsString('class="metric-value">50</span>', $document->getContent());
            $this->assertSame(50, substr_count($document->getContent(), DemoAnalyticsSeeder::REFERENCE_PREFIX));

            $monthlyDocument = $this->get('/api/v1/reports/documents/report?period_type=monthly&month=2026-09&appendix=1')
                ->assertOk();
            $this->assertStringContainsString('class="metric-value">10</span>', $monthlyDocument->getContent());
            $this->assertSame(10, substr_count($monthlyDocument->getContent(), DemoAnalyticsSeeder::REFERENCE_PREFIX));
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    private function seedAnalyticsPrerequisites(): void
    {
        // Isolate this seeder's contract from the other default demo datasets.
        foreach ([
            'field@caneguard.test' => User::ROLE_FIELD_REPORTER,
            'mao@caneguard.test' => User::ROLE_REVIEWER,
            'admin@caneguard.test' => User::ROLE_ADMIN,
        ] as $email => $role) {
            User::factory()->create(['email' => $email, 'role' => $role]);
        }
        $this->seed(OfficeAdvisorySeeder::class);
    }

    private function configureDemoPasswords(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
        ]);
    }
}
