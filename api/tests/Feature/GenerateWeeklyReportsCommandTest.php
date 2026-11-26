<?php

namespace Tests\Feature;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Models\District;
use App\Models\DistrictReportVersion;
use App\Models\DistrictRssiReportVersion;
use App\Models\Report;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GenerateWeeklyReportsCommandTest extends TestCase
{
    use RefreshDatabase;

    private District $district;

    protected function setUp(): void
    {
        parent::setUp();
        $this->district = $this->pilotDistrict();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_scheduled_command_generates_both_5_disease_and_rssi_reports_at_default_monday_6am_pht_idempotently(): void
    {
        // Week 2026-W47: Mon Nov 16 to Sun Nov 22, 2026 (Asia/Manila).
        Report::factory()->inDistrict($this->district)->create([
            'reference_code' => 'CG-AUTO-RSSI',
            'submitted_at' => '2026-11-18 02:00:00', // Wed Nov 18, 10:00 AM PHT
            'barangay' => 'Banilad',
            'predicted_label' => 'unknown',
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'verified',
            'affected_area_hectares' => 1.5,
            'farmer_or_farm_owner_name' => 'PRIVATE AUTOMATION FARM',
        ]);
        Report::factory()->inDistrict($this->district)->create([
            'reference_code' => 'CG-AUTO-RUST',
            'submitted_at' => '2026-11-19 04:00:00',
            'barangay' => 'Bucana',
            'predicted_label' => 'rust',
            'authority_classified_condition' => 'rust',
            'verification_outcome' => 'verified',
        ]);

        // Before 6:00 AM PHT Monday -> does not fire yet.
        Carbon::setTestNow(Carbon::parse('2026-11-23 05:59:00', 'Asia/Manila'));
        $this->artisan('reports:generate-weekly')->assertSuccessful();
        $this->assertDatabaseCount('district_report_versions', 0);
        $this->assertDatabaseCount('district_rssi_report_versions', 0);

        // At 6:00 AM PHT Monday -> generates both v1 snapshots for 2026-W47.
        Carbon::setTestNow(Carbon::parse('2026-11-23 06:00:00', 'Asia/Manila'));
        $this->artisan('reports:generate-weekly')->assertSuccessful();

        $this->assertDatabaseCount('district_report_versions', 1);
        $this->assertDatabaseCount('district_rssi_report_versions', 1);

        $fiveDisease = DistrictReportVersion::query()->sole();
        $this->assertSame('2026-11-16', substr((string) $fiveDisease->week_start, 0, 10));
        $this->assertSame(1, $fiveDisease->version);
        $this->assertSame('scheduled', $fiveDisease->prepared_source);
        $this->assertNull($fiveDisease->prepared_by_id);
        $this->assertNull($fiveDisease->approved_at);
        $this->assertSame(2, $fiveDisease->content['case_universe']['cases']);

        $rssi = DistrictRssiReportVersion::query()->sole();
        $this->assertSame('2026-11-16', substr((string) $rssi->week_start, 0, 10));
        $this->assertSame(1, $rssi->version);
        $this->assertSame('scheduled', $rssi->prepared_source);
        $this->assertNull($rssi->prepared_by_id);
        $this->assertSame(1, $rssi->content['sections']['validated']['cases']);
        $this->assertStringNotContainsString('PRIVATE AUTOMATION FARM', $rssi->csv_content);

        $this->assertDatabaseHas('district_report_events', [
            'district_report_version_id' => $fiveDisease->id,
            'action' => 'scheduled_prepared',
            'actor_id' => null,
            'actor_role' => 'system',
        ]);
        $this->assertDatabaseHas('security_audits', [
            'action' => SecurityAudit::ACTION_WEEKLY_REPORTS_GENERATED,
            'outcome' => SecurityAudit::OUTCOME_SUCCESS,
        ]);
        $this->assertDatabaseHas('district_reporting_settings', [
            'district_id' => $this->district->id,
            'last_auto_status' => 'success',
            'last_auto_week' => '2026-W47',
        ]);

        // Re-running inside catch-up window (6:15 AM) is a safe no-op with zero duplicates.
        Carbon::setTestNow(Carbon::parse('2026-11-23 06:15:00', 'Asia/Manila'));
        $this->artisan('reports:generate-weekly')->assertSuccessful();
        $this->assertDatabaseCount('district_report_versions', 1);
        $this->assertDatabaseCount('district_rssi_report_versions', 1);
    }

    public function test_cron_never_overwrites_an_approved_version_and_does_not_auto_churn_drafts(): void
    {
        $admin = User::factory()->admin()->inDistrict($this->district)->create();
        $report = Report::factory()->inDistrict($this->district)->create([
            'submitted_at' => '2026-11-18 02:00:00',
            'authority_classified_condition' => 'smut',
            'verification_outcome' => 'verified',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-23 06:00:00', 'Asia/Manila'));
        $this->artisan('reports:generate-weekly')->assertSuccessful();

        $v1 = DistrictReportVersion::query()->sole();
        $approved = app(DistrictReportWorkflow::class)->approve($admin, $v1, $v1->content_hash)->fresh();
        $originalSha = $approved->document_sha256;

        // Evidence changes after approval.
        $report->update(['review_notes' => 'Updated review note', 'lock_version' => 1]);

        // Even with --force-refresh, an already-approved version is never overwritten.
        $this->artisan('reports:generate-weekly', ['--week' => '2026-W47', '--force-refresh' => true])->assertSuccessful();
        $this->assertDatabaseCount('district_report_versions', 1);
        $this->assertSame($originalSha, $approved->fresh()->document_sha256);
        $this->assertDatabaseCount('district_report_transmissions', 0);
    }

    public function test_dry_run_and_explicit_week_flags_work_safely(): void
    {
        $this->artisan('reports:generate-weekly', ['--week' => '2026-W45', '--dry-run' => true])->assertSuccessful();
        $this->assertDatabaseCount('district_report_versions', 0);
        $this->assertDatabaseCount('district_rssi_report_versions', 0);

        $this->artisan('reports:generate-weekly', ['--week' => '2026-W45'])->assertSuccessful();
        $this->assertDatabaseCount('district_report_versions', 1);
        $this->assertDatabaseCount('district_rssi_report_versions', 1);
        $this->assertSame('2026-11-02', substr((string) DistrictReportVersion::query()->sole()->week_start, 0, 10));

        // Invalid ISO week fails cleanly.
        $this->artisan('reports:generate-weekly', ['--week' => 'invalid-week'])->assertFailed();
    }

    public function test_configurable_schedule_and_disable_toggle_are_respected(): void
    {
        $admin = User::factory()->admin()->inDistrict($this->district)->create();
        DB::table('district_reporting_settings')->insert([
            'district_id' => $this->district->id,
            'auto_generate_enabled' => true,
            'auto_generate_day' => 2, // Tuesday
            'auto_generate_time' => '07:30',
            'office_reference' => 'cfg-test',
            'updated_by_id' => $admin->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Monday 06:00 does NOT run when configured for Tuesday 07:30.
        Carbon::setTestNow(Carbon::parse('2026-11-23 06:00:00', 'Asia/Manila'));
        $this->artisan('reports:generate-weekly')->assertSuccessful();
        $this->assertDatabaseCount('district_report_versions', 0);

        // Tuesday 07:45 (catch-up) DOES run.
        Carbon::setTestNow(Carbon::parse('2026-11-24 07:45:00', 'Asia/Manila'));
        $this->artisan('reports:generate-weekly')->assertSuccessful();
        $this->assertDatabaseCount('district_report_versions', 1);
        $this->assertDatabaseCount('district_rssi_report_versions', 1);

        // Disabling stops future weeks.
        DB::table('district_reporting_settings')->where('district_id', $this->district->id)->update(['auto_generate_enabled' => false]);
        Carbon::setTestNow(Carbon::parse('2026-12-01 07:45:00', 'Asia/Manila'));
        $this->artisan('reports:generate-weekly')->assertSuccessful();
        $this->assertDatabaseCount('district_report_versions', 1);
    }

    public function test_command_is_registered_in_scheduler_every_fifteen_minutes(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn ($e) => str_contains($e->command, 'reports:generate-weekly'));
        $this->assertNotNull($event);
        $this->assertSame('*/15 * * * *', $event->expression);
        $this->assertSame('Asia/Manila', $event->timezone);
    }
}
