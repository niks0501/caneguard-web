<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoAnalyticsSeeder;
use Database\Seeders\OfficeAdvisorySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ReportMetricExpectations;
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
            $firstSeedIdentities = Report::query()->orderBy('id')->get(['id', 'uuid', 'reference_code'])->toArray();
            $this->seed(DemoAnalyticsSeeder::class);
            $this->assertSame(
                $firstSeedIdentities,
                Report::query()->orderBy('id')->get(['id', 'uuid', 'reference_code'])->toArray(),
            );

            $reviewer = User::query()->where('email', 'mao@caneguard.test')->firstOrFail();
            Sanctum::actingAs($reviewer);
            $allReports = Report::query()->whereNull('canonical_report_id')->orderBy('reference_code')->get();
            $this->assertNotEmpty($allReports);
            $reportsResponse = $this->getJson('/api/v1/reports?per_page=100')->assertOk();
            $reportsResponse->assertJsonPath('meta.total', $allReports->count())
                ->assertJsonCount($allReports->count(), 'data');

            $month = CarbonImmutable::now('Asia/Manila')->format('Y-m');
            $monthStart = CarbonImmutable::parse($month.'-01', 'Asia/Manila')->startOfMonth();
            $monthEnd = $monthStart->addMonth();
            $monthReports = $allReports->filter(fn (Report $report): bool =>
                $report->submitted_at->gte($monthStart->utc()) && $report->submitted_at->lt($monthEnd->utc())
            )->values();
            $dashboard = $this->getJson('/api/v1/dashboard/summary?include=counts,recent,monthly')
                ->assertOk()
                ->assertJsonPath('data.counts.total_submitted', $allReports->count())
                ->assertJsonPath('data.monthly_summary.month', $month)
                ->assertJsonPath('data.monthly_summary.reported_cases', $monthReports->count());
            $dashboard->assertJsonPath(
                'data.monthly_summary.cases_by_barangay',
                ReportMetricExpectations::groupedCounts($monthReports, 'barangay', 'barangay'),
            )->assertJsonPath(
                'data.monthly_summary.cases_by_possible_condition',
                ReportMetricExpectations::groupedCounts($monthReports, 'predicted_label', 'possible_condition'),
            );

            $rangeStart = CarbonImmutable::parse('2026-05-01', 'Asia/Manila')->startOfDay();
            $rangeEnd = CarbonImmutable::parse('2026-10-01', 'Asia/Manila')->startOfDay();
            $rangeReports = $allReports->filter(fn (Report $report): bool =>
                $report->submitted_at->gte($rangeStart->utc()) && $report->submitted_at->lt($rangeEnd->utc())
            )->values();
            $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => '2026-05-01',
                'to' => '2026-09-30',
                'granularity' => 'week',
            ]))->assertOk()
                ->assertJsonPath('data.total_submitted', $rangeReports->count())
                ->assertJsonPath('data.cases_by_barangay', ReportMetricExpectations::groupedCounts($rangeReports, 'barangay', 'barangay'))
                ->assertJsonPath('data.cases_by_possible_condition', ReportMetricExpectations::groupedCounts($rangeReports, 'predicted_label', 'possible_condition'));
            $analyticsPayload = json_decode($analytics->getContent(), false, 512, JSON_THROW_ON_ERROR);
            $this->assertIsObject($analyticsPayload->data->filters);
            $this->assertSame([], (array) $analyticsPayload->data->filters);

            $filteredReports = $rangeReports->filter(fn (Report $report): bool =>
                $report->review_status === Report::STATUS_FOR_FIELD_VALIDATION
                && $report->fieldValidationAssignment?->completion?->follow_up_outcome === 'worsened'
            )->values();
            $filteredAnalytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => '2026-05-01',
                'to' => '2026-09-30',
                'granularity' => 'week',
                'status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'follow_up_outcome' => 'worsened',
            ]))->assertOk()->assertJsonPath('data.total_submitted', $filteredReports->count());
            $filteredPayload = json_decode($filteredAnalytics->getContent(), false, 512, JSON_THROW_ON_ERROR);
            $this->assertIsObject($filteredPayload->data->filters);
            $this->assertSame(Report::STATUS_FOR_FIELD_VALIDATION, $filteredPayload->data->filters->status);
            $this->assertSame('worsened', $filteredPayload->data->filters->follow_up_outcome);

            $improvedCount = $allReports->filter(fn (Report $report): bool =>
                $report->fieldValidationAssignment?->completion?->follow_up_outcome === 'improved'
            )->count();
            $this->getJson('/api/v1/reports?follow_up_outcome=improved&per_page=100')
                ->assertOk()
                ->assertJsonPath('meta.total', $improvedCount);

            $unverifiedReports = $allReports->where('review_status', Report::STATUS_SUBMITTED_UNVERIFIED)->values();
            $locatedCount = $unverifiedReports->filter(fn (Report $report): bool =>
                $report->final_latitude !== null && $report->final_longitude !== null
            )->count();
            $this->getJson('/api/v1/reports/map?status='.Report::STATUS_SUBMITTED_UNVERIFIED)
                ->assertOk()
                ->assertJsonPath('metadata.total_count', $unverifiedReports->count())
                ->assertJsonPath('metadata.located_count', $locatedCount)
                ->assertJsonPath('metadata.unlocated_count', $unverifiedReports->count() - $locatedCount)
                ->assertJsonCount($locatedCount, 'features');

            $detail = $allReports->first();
            $this->assertNotNull($detail);
            $this->getJson('/api/v1/reports/'.$detail->uuid)
                ->assertOk()
                ->assertJsonPath('data.identity.uuid', $detail->uuid)
                ->assertJsonPath('data.model.predicted_label', $detail->predicted_label)
                ->assertJsonCount($detail->classScores()->count(), 'data.model.class_scores');
            $advisoryCase = $allReports->first(fn (Report $report): bool =>
                $report->action_taken === Report::ACTION_ADVISORY_PROVIDED
            );
            $this->assertNotNull($advisoryCase);
            $this->getJson('/api/v1/reports/'.$advisoryCase->uuid)
                ->assertOk()
                ->assertJsonPath('data.identity.uuid', $advisoryCase->uuid)
                ->assertJsonPath('data.advisory.status', 'validated');

            $customReports = $rangeReports->sortBy('reference_code')->values();
            $document = $this->get('/api/v1/reports/documents/report?'.http_build_query([
                'period_type' => 'custom',
                'from' => '2026-05-01',
                'to' => '2026-09-30',
                'appendix' => true,
            ]))->assertOk();
            $customHtml = $document->getContent();
            $this->assertStringContainsString('class="metric-value">'.$rangeReports->count().'</span>', $customHtml);
            $this->assertAppendixReferences($customHtml, $customReports);

            $monthlyDocument = $this->get('/api/v1/reports/documents/report?period_type=monthly&month='.$month.'&appendix=1')
                ->assertOk();
            $monthlyHtml = $monthlyDocument->getContent();
            $this->assertStringContainsString('class="metric-value">'.$monthReports->count().'</span>', $monthlyHtml);
            $this->assertAppendixReferences($monthlyHtml, $monthReports->sortBy('reference_code')->values());
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    private function assertAppendixReferences(string $html, Collection $reports): void
    {
        $document = new \DOMDocument();
        $previousLibxmlState = libxml_use_internal_errors(true);
        try {
            $document->loadHTML($html);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previousLibxmlState);
        }
        $references = (new \DOMXPath($document))->query('//section[@aria-labelledby="appendix"]//tbody/tr/td[1]');
        $actual = [];
        foreach ($references as $reference) {
            $actual[] = trim($reference->textContent);
        }
        $expected = $reports->pluck('reference_code')->all();
        sort($actual);
        sort($expected);
        $this->assertSame($expected, $actual);
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
