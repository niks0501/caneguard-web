<?php

namespace Tests\MySql;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Actions\Reports\RenderWeeklyReport;
use App\Models\DistrictGrant;
use App\Models\DistrictRecipientSet;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
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

    public function test_sql_manila_trend_canonical_json_approval_bytes_and_explicit_retry_survive_mysql(): void
    {
        $district = $this->pilotDistrict();
        $officer = User::factory()->admin()->inDistrict($district)->create();
        foreach (['report:approve', 'report:send'] as $ability) {
            DistrictGrant::query()->create(['user_id' => $officer->id, 'district_id' => $district->id, 'ability' => $ability]);
        }
        DistrictRecipientSet::query()->create(['district_id' => $district->id, 'recipients' => ['dummy@example.test'], 'office_reference' => 'synthetic-mysql-contract']);
        $report = Report::factory()->inDistrict($district)->create(['submitted_at' => '2026-09-27 16:00:00', 'observed_at' => '2026-09-27 16:00:00', 'predicted_label' => 'smut', 'authority_classified_condition' => 'smut', 'verification_outcome' => 'verified']);
        $workflow = app(DistrictReportWorkflow::class);
        $one = $workflow->prepare($officer, '2026-W40');
        $this->assertSame(1, $one->content['trend'][0]['count']);
        $this->assertSame($one->id, $workflow->prepare($officer, '2026-W40')->id);
        $approved = $workflow->approve($officer, $one->fresh(), $one->content_hash)->fresh();
        $this->assertSame($approved->document_sha256, hash('sha256', app(RenderWeeklyReport::class)->approvedBytes($approved)));
        $intent = $workflow->requestSend($officer, $approved, $approved->content_hash, (string) Str::uuid());
        $this->assertTrue($workflow->checkPending($intent));
        $intent->update(['state' => 'failed']);
        $retry = $workflow->requestSend($officer, $approved, $approved->content_hash, (string) Str::uuid());
        $this->assertNotSame($intent->id, $retry->id);
        $this->assertTrue($workflow->checkPending($retry));
        $report->update(['review_notes' => 'Evidence correction only', 'lock_version' => 1]);
        $this->assertFalse($workflow->checkPending($retry));
        $two = $workflow->prepare($officer, '2026-W40');
        $this->assertSame('correction', $two->version_reason);
        $this->assertSame($one->id, $two->supersedes_version_id);
        $this->assertSame($two->id, $workflow->prepare($officer, '2026-W40')->id);
    }
}
