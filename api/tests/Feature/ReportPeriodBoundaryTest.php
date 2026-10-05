<?php

namespace Tests\Feature;

use App\Actions\Reports\BuildReportDocument;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportPeriodBoundaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_monthly_summary_returns_zero_counts_when_database_has_no_reports(): void
    {
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());

        $this->getJson('/api/v1/dashboard/summary?month=2026-09&include=counts,queues,recent,monthly')
            ->assertOk()
            ->assertJsonPath('data.monthly_summary.month', '2026-09')
            ->assertJsonPath('data.monthly_summary.reported_cases', 0)
            ->assertJsonPath('data.monthly_summary.field_validation_counts.unassigned', 0)
            ->assertJsonPath('data.monthly_summary.field_validation_counts.assigned', 0)
            ->assertJsonPath('data.monthly_summary.field_validation_counts.in_progress', 0)
            ->assertJsonPath('data.monthly_summary.field_validation_counts.completed', 0)
            ->assertJsonPath('data.monthly_summary.field_validation_counts.requiring_validation', 0);
    }

    public function test_monthly_summaries_analytics_and_documents_share_manila_month_boundaries(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MANILA-SEP-BOUNDARY',
            'submitted_at' => CarbonImmutable::parse('2026-09-30 15:59:59', 'UTC'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MANILA-OCT-BOUNDARY',
            'submitted_at' => CarbonImmutable::parse('2026-09-30 16:00:00', 'UTC'),
        ]);

        Sanctum::actingAs($reviewer);

        foreach ([
            [
                'month' => '2026-09',
                'from' => '2026-09-01',
                'to' => '2026-09-30',
                'bucket' => '2026-09-30',
            ],
            [
                'month' => '2026-10',
                'from' => '2026-10-01',
                'to' => '2026-10-31',
                'bucket' => '2026-10-01',
            ],
        ] as $period) {
            $summary = $this->getJson('/api/v1/reports/summary?month='.$period['month'])
                ->assertOk()
                ->assertJsonPath('data.month', $period['month'])
                ->assertJsonPath('data.period.from', $period['from'])
                ->assertJsonPath('data.period.to', $period['to'])
                ->assertJsonPath('data.reported_cases', 1)
                ->json('data');

            $dashboard = $this->getJson('/api/v1/dashboard/summary?month='.$period['month'].'&include=counts,queues,recent,monthly')
                ->assertOk()
                ->assertJsonPath('data.monthly_summary.month', $period['month'])
                ->assertJsonPath('data.monthly_summary.reported_cases', 1)
                ->assertJsonPath('data.monthly_summary.period.from', $period['from'])
                ->assertJsonPath('data.monthly_summary.period.to', $period['to'])
                ->json('data.monthly_summary');

            $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => $period['from'],
                'to' => $period['to'],
                'granularity' => 'day',
                'date_from' => $period['from'],
                'date_to' => $period['to'],
            ]))
                ->assertOk()
                ->assertJsonPath('data.period.from', $period['from'])
                ->assertJsonPath('data.period.to', $period['to'])
                ->assertJsonPath('data.period.timezone', 'Asia/Manila')
                ->assertJsonPath('data.total_submitted', 1)
                ->assertJsonFragment(['label' => $period['bucket'], 'count' => 1])
                ->json('data');

            $document = app(BuildReportDocument::class)->handle([
                'period_type' => 'monthly',
                'month' => $period['month'],
            ]);

            $this->assertSame($period['from'], $document['period']['from']);
            $this->assertSame($period['to'], $document['period']['to']);
            $this->assertSame('Asia/Manila', $document['period']['timezone']);
            $this->assertSame(1, $document['metrics']['reported_cases']);
            $this->assertSame($summary['reported_cases'], $dashboard['reported_cases']);
            $this->assertSame($summary['reported_cases'], $analytics['total_submitted']);
        }
    }
}
