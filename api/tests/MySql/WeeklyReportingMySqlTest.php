<?php

namespace Tests\MySql;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Actions\Reports\DistrictRssiReportWorkflow;
use App\Actions\Reports\RenderWeeklyReport;
use App\Models\DistrictGrant;
use App\Models\DistrictRecipientSet;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class WeeklyReportingMySqlTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/^firstmate_[a-z0-9_]+$/D', DB::connection()->getDatabaseName());
        Queue::fake();
        config(['caneguard.weekly_send_enabled' => true]);
    }

    public function test_sql_manila_trend_canonical_json_approval_bytes_and_scheduled_rssi_snapshots_survive_mysql(): void
    {
        $district = $this->pilotDistrict();
        $officer = User::factory()->admin()->inDistrict($district)->create();
        foreach (['report:approve', 'report:send'] as $ability) {
            DistrictGrant::query()->create(['user_id' => $officer->id, 'district_id' => $district->id, 'ability' => $ability]);
        }
        DistrictRecipientSet::query()->create(['district_id' => $district->id, 'recipients' => ['dummy@example.test'], 'office_reference' => 'synthetic-mysql-contract']);
        $report = Report::factory()->inDistrict($district)->create(['submitted_at' => '2026-09-27 16:00:00', 'observed_at' => '2026-09-27 16:00:00', 'predicted_label' => 'smut', 'authority_classified_condition' => 'smut', 'verification_outcome' => 'verified']);
        Report::factory()->inDistrict($district)->create(['submitted_at' => '2026-09-29 02:00:00', 'authority_classified_condition' => 'rssi', 'verification_outcome' => 'verified']);
        $workflow = app(DistrictReportWorkflow::class);
        $scheduled = $workflow->prepareScheduled($district, '2026-W40');
        $this->assertNull($scheduled->prepared_by_id);
        $this->assertSame('scheduled', $scheduled->prepared_source);
        $this->assertSame(1, $scheduled->content['trend'][0]['count']);
        $this->assertSame(1, $scheduled->content['trend'][1]['count']);
        $this->assertSame($scheduled->id, $workflow->prepareScheduled($district, '2026-W40')->id);

        $rssiWorkflow = app(DistrictRssiReportWorkflow::class);
        $rssi = $rssiWorkflow->prepareScheduled($district, '2026-W40');
        $this->assertNull($rssi->prepared_by_id);
        $this->assertSame('scheduled', $rssi->prepared_source);
        $this->assertSame(1, $rssi->content['sections']['validated']['cases']);
        $this->assertSame($rssi->pdf_sha256, hash('sha256', $rssiWorkflow->pdfBytes($rssi)));

        $approved = $workflow->approve($officer, $scheduled->fresh(), $scheduled->content_hash)->fresh();
        $this->assertSame($approved->document_sha256, hash('sha256', app(RenderWeeklyReport::class)->approvedBytes($approved)));
        $report->update(['review_notes' => 'Evidence correction only', 'lock_version' => 1]);
        $two = $workflow->prepare($officer, '2026-W40');
        $this->assertSame('correction', $two->version_reason);
        $this->assertSame($scheduled->id, $two->supersedes_version_id);
        $this->assertSame($two->id, $workflow->prepare($officer, '2026-W40')->id);
    }
}
