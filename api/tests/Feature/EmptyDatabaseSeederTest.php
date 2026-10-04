<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\LaravelPdf\Facades\Pdf;
use Spatie\LaravelPdf\PdfBuilder;
use Tests\TestCase;

class EmptyDatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
        ]);
    }

    public function test_default_seed_keeps_demo_accounts_and_all_report_surfaces_work_empty(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount('users', 3);
        $this->assertDatabaseCount('reports', 0);
        $this->assertDatabaseCount('advisories', 3);
        $this->assertDatabaseCount('report_class_scores', 0);
        $this->assertDatabaseCount('report_symptoms', 0);
        $this->assertDatabaseCount('report_quality_warnings', 0);
        $this->assertDatabaseCount('report_audits', 0);
        $this->assertDatabaseCount('report_referrals', 0);
        $this->assertDatabaseCount('field_validation_assignments', 0);
        $this->assertDatabaseCount('field_validation_completions', 0);
        $this->assertDatabaseCount('report_review_events', 0);

        $reviewer = User::query()->where('email', 'mao@caneguard.test')->firstOrFail();
        Sanctum::actingAs($reviewer);
        $advisories = $this->getJson('/api/v1/advisories')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->json('data');
        $this->assertSame([
            'ADV-OFFICE-OPS-001',
            'ADV-OFFICE-OPS-002',
            'ADV-OFFICE-OPS-003',
        ], array_column($advisories, 'code'));
        foreach ($advisories as $advisory) {
            $this->assertSame('validated', $advisory['status']);
            $this->assertNotEmpty($advisory['content']);
        }

        $dashboard = $this->getJson('/api/v1/dashboard/summary?month=2026-09&include=counts,queues,recent,monthly')
            ->assertOk()
            ->json('data');
        $this->assertSame(0, $dashboard['counts']['total_submitted']);
        foreach (Report::reviewStatuses() as $status) {
            $this->assertSame(0, $dashboard['counts'][$status]);
        }
        foreach (Report::operationalQueues() as $queue) {
            $this->assertSame(0, $dashboard['queues'][$queue]);
        }
        $this->assertSame([], $dashboard['recent_reports']);
        $this->assertSame(0, $dashboard['monthly_summary']['reported_cases']);
        $this->assertSame([], $dashboard['monthly_summary']['cases_by_barangay']);
        $this->assertSame([], $dashboard['monthly_summary']['cases_by_possible_condition']);
        $this->assertSame(0, $dashboard['monthly_summary']['estimated_affected_hectares']);

        $this->getJson('/api/v1/reports?per_page=10')
            ->assertOk()
            ->assertJsonPath('data', [])
            ->assertJsonPath('meta.total', 0);

        $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-02',
            'granularity' => 'day',
        ]))
            ->assertOk()
            ->assertJsonPath('data.total_submitted', 0)
            ->assertJsonPath('data.series', [
                ['label' => '2026-09-01', 'count' => 0],
                ['label' => '2026-09-02', 'count' => 0],
            ])
            ->assertJsonPath('data.cases_by_barangay', [])
            ->assertJsonPath('data.cases_by_possible_condition', [])
            ->assertJsonPath('data.case_state', ['open' => 0, 'closed' => 0])
            ->assertJsonPath('data.comparison.delta', 0);

        $this->getJson('/api/v1/reports/map')
            ->assertOk()
            ->assertJsonPath('type', 'FeatureCollection')
            ->assertJsonPath('features', [])
            ->assertJsonPath('metadata.total_count', 0)
            ->assertJsonPath('metadata.located_count', 0)
            ->assertJsonPath('metadata.unlocated_count', 0)
            ->assertJsonPath('metadata.returned_count', 0);

        $this->getJson('/api/v1/reports/field-validation-queue?limit=50')
            ->assertOk()
            ->assertJsonPath('data.count', 0)
            ->assertJsonPath('data.items', [])
            ->assertJsonPath('data.oldest', null);

        $document = $this->get('/api/v1/reports/documents/report?period_type=monthly&month=2026-09')
            ->assertOk()
            ->assertHeader('Content-Type', 'text/html; charset=UTF-8')
            ->assertSeeText('No submitted reports in this period.');
        $this->assertStringContainsString('<span class="metric-value">0</span>', $document->getContent());

        $pdf = Pdf::fake();
        $this->get('/api/v1/reports/documents/report/pdf?period_type=monthly&month=2026-09')
            ->assertOk();
        $pdf->assertRespondedWithPdf(
            static fn (PdfBuilder $builder): bool => $builder->viewName === 'reports.document'
                && ($builder->viewData['metrics']['reported_cases'] ?? null) === 0,
        );

        $this->assertDatabaseCount('reports', 0);
    }
}
