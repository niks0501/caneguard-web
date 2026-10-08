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

            $month = '2026-09';
            $monthStart = CarbonImmutable::parse($month.'-01', 'Asia/Manila')->startOfMonth();
            $monthEnd = $monthStart->addMonth();
            $monthReports = $allReports->filter(fn (Report $report): bool =>
                $report->submitted_at->gte($monthStart->utc()) && $report->submitted_at->lt($monthEnd->utc())
            )->values();
            $dashboard = $this->getJson('/api/v1/dashboard/summary?month='.$month.'&include=counts,queues,recent,monthly')
                ->assertOk()
                ->assertJsonPath('data.counts.total_submitted', $allReports->count())
                ->assertJsonPath('data.monthly_summary.month', $month)
                ->assertJsonPath('data.monthly_summary.reported_cases', $monthReports->count());
            foreach (Report::operationalQueues() as $queue) {
                $this->assertSame($this->expectedQueueCount($allReports, $queue), $dashboard->json("data.queues.{$queue}"));
            }
            $dashboard->assertJsonPath(
                'data.monthly_summary.cases_by_barangay',
                $this->expectedGroups($monthReports, 'barangay', 'barangay'),
            )->assertJsonPath(
                'data.monthly_summary.cases_by_possible_condition',
                $this->expectedGroups($monthReports, 'predicted_label', 'possible_condition'),
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
                ->assertJsonPath('data.cases_by_barangay', $this->expectedGroups($rangeReports, 'barangay', 'barangay'))
                ->assertJsonPath('data.cases_by_possible_condition', $this->expectedGroups($rangeReports, 'predicted_label', 'possible_condition'));
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

            $today = CarbonImmutable::now('Asia/Manila')->toDateString();
            $allReports->load('fieldValidationAssignment.completion');
            foreach (['needs_visit', 'follow_up_due', 'upcoming'] as $queue) {
                $expected = $this->expectedQueueCount($allReports, $queue, $today);
                $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
                    'queue' => $queue,
                    'limit' => 50,
                ]))->assertOk()
                    ->assertJsonPath('data.count', $expected)
                    ->assertJsonCount($expected, 'data.items');
            }

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

            $monthlyDocument = $this->get('/api/v1/reports/documents/report?period_type=monthly&month=2026-09&appendix=1')
                ->assertOk();
            $monthlyHtml = $monthlyDocument->getContent();
            $this->assertStringContainsString('class="metric-value">'.$monthReports->count().'</span>', $monthlyHtml);
            $this->assertAppendixReferences($monthlyHtml, $monthReports->sortBy('reference_code')->values());
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    private function expectedGroups(Collection $reports, string $field, string $key): array
    {
        $counts = [];
        foreach ($reports as $report) {
            $value = $report->getAttribute($field);
            $groupKey = $value ?? '';
            $counts[$groupKey] = ($counts[$groupKey] ?? 0) + 1;
        }

        $groups = [];
        foreach ($counts as $value => $count) {
            $groups[] = [$key => $value === '' ? null : $value, 'reported_cases' => $count];
        }
        usort($groups, fn (array $left, array $right): int =>
            ($right['reported_cases'] <=> $left['reported_cases'])
            ?: strcmp((string) $left[$key], (string) $right[$key])
        );

        return $groups;
    }

    private function expectedQueueCount(Collection $reports, string $queue, ?string $today = null): int
    {
        $today ??= CarbonImmutable::now('Asia/Manila')->toDateString();

        return $reports->filter(function (Report $report) use ($queue, $today): bool {
            if ($report->canonical_report_id !== null) {
                return false;
            }

            $state = $report->field_validation_state;
            $assignment = $report->fieldValidationAssignment;
            $target = $assignment?->target_visit_date?->toDateString();

            return match ($queue) {
                Report::QUEUE_NEEDS_REVIEW => $report->case_state === Report::CASE_STATE_OPEN
                    && $report->verification_outcome === Report::VERIFICATION_OUTCOME_NOT_DETERMINED
                    && ($report->action_taken === null || $report->action_taken === Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION)
                    && ($state === Report::FIELD_VALIDATION_STATE_COMPLETED
                        || ($state === Report::FIELD_VALIDATION_STATE_UNASSIGNED
                            && $report->review_status !== Report::STATUS_FOR_FIELD_VALIDATION)),
                Report::QUEUE_NEEDS_VISIT => $report->case_state === Report::CASE_STATE_OPEN
                    && $state !== Report::FIELD_VALIDATION_STATE_COMPLETED
                    && (in_array($state, [Report::FIELD_VALIDATION_STATE_ASSIGNED, Report::FIELD_VALIDATION_STATE_IN_PROGRESS], true)
                        || ($state === Report::FIELD_VALIDATION_STATE_UNASSIGNED
                            && $report->review_status === Report::STATUS_FOR_FIELD_VALIDATION)),
                Report::QUEUE_FOLLOW_UP_DUE => $report->case_state === Report::CASE_STATE_OPEN
                    && $state !== Report::FIELD_VALIDATION_STATE_COMPLETED
                    && $target !== null && $target < $today,
                Report::QUEUE_UPCOMING => $report->case_state === Report::CASE_STATE_OPEN
                    && $state !== Report::FIELD_VALIDATION_STATE_COMPLETED
                    && $target !== null && $target >= $today,
                Report::QUEUE_UNVERIFIED_NO_ACTIVE_WORK => $report->case_state === Report::CASE_STATE_OPEN
                    && $report->verification_outcome === Report::VERIFICATION_OUTCOME_NOT_DETERMINED
                    && $state === Report::FIELD_VALIDATION_STATE_UNASSIGNED
                    && $report->action_taken !== null
                    && $report->action_taken !== Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
                default => throw new \InvalidArgumentException("Unsupported queue: {$queue}"),
            };
        })->count();
    }

    private function assertAppendixReferences(string $html, Collection $reports): void
    {
        foreach ($reports as $report) {
            $this->assertSame(1, substr_count($html, $report->reference_code), $report->reference_code);
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
