<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Actions\Reports\BuildWeeklyReportContent;
use App\Actions\Reports\DistrictReportWorkflow;
use App\Actions\Reports\DistrictRssiReportWorkflow;
use App\Models\District;
use App\Models\DistrictReportVersion;
use App\Models\DistrictRssiReportVersion;
use App\Models\SecurityAudit;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class GenerateWeeklyReports extends Command
{
    public const DEFAULT_DAY = 1; // Monday

    public const DEFAULT_TIME = '06:00'; // 6:00 AM Asia/Manila

    protected $signature = 'reports:generate-weekly
        {--week= : Specific ISO week (YYYY-Www) to generate or backfill immediately}
        {--dry-run : Inspect target week and planned actions without writing to the database}
        {--force-refresh : Rebuild unapproved snapshots if source evidence changed}';

    protected $description = 'Automatically generate weekly 5-disease and RSSI report snapshots for the completed ISO week';

    public function handle(
        DistrictAccess $access,
        BuildWeeklyReportContent $periods,
        DistrictReportWorkflow $fiveDiseaseWorkflow,
        DistrictRssiReportWorkflow $rssiWorkflow,
        RecordSecurityAudit $audit,
    ): int {
        $districtId = $access->pilotId();
        $district = $districtId === null ? null : District::query()->find($districtId);
        if ($district === null) {
            $this->info('No active pilot district configured; skipping.');

            return self::SUCCESS;
        }

        $settings = DB::table('district_reporting_settings')->where('district_id', $district->id)->first();
        $explicitWeek = $this->option('week');
        $dryRun = (bool) $this->option('dry-run');
        $forceRefresh = (bool) $this->option('force-refresh');

        if ($explicitWeek !== null && $explicitWeek !== '') {
            try {
                $periods->period((string) $explicitWeek);
            } catch (ValidationException $exception) {
                $this->error($exception->getMessage());

                return self::FAILURE;
            }
            $week = (string) $explicitWeek;
        } else {
            $enabled = $settings === null ? true : (bool) ($settings->auto_generate_enabled ?? true);
            if (! $enabled) {
                $this->info('Automatic weekly report generation is disabled in settings.');

                return self::SUCCESS;
            }

            $day = (int) ($settings->auto_generate_day ?? self::DEFAULT_DAY);
            $time = (string) ($settings->auto_generate_time ?? self::DEFAULT_TIME);
            $now = CarbonImmutable::now('Asia/Manila');
            [$hour, $minute] = array_map('intval', explode(':', $time));
            $slot = $now->startOfWeek()->addDays($day - 1)->setTime($hour, $minute);

            // Catch-up window from the scheduled Manila slot until the end of that day.
            if ($now->lt($slot) || ! $now->isSameDay($slot)) {
                return self::SUCCESS;
            }

            $week = $now->subWeek()->startOfWeek()->format('o-\WW');
        }

        $weekStart = $periods->period($week)['start']->toDateString();

        if ($dryRun) {
            $existingFiveDisease = DistrictReportVersion::query()
                ->where('district_id', $district->id)
                ->where('week_start', $weekStart)
                ->orderByDesc('version')
                ->first();
            $existingRssi = DistrictRssiReportVersion::query()
                ->where('district_id', $district->id)
                ->where('week_start', $weekStart)
                ->orderByDesc('version')
                ->first();

            $this->info("Dry run for {$district->code} · {$week} (week_start={$weekStart}):");
            $this->line('  5-Disease: '.($existingFiveDisease ? "exists (v{$existingFiveDisease->version}, ".($existingFiveDisease->approved_at ? 'approved' : 'draft').')' : 'would generate v1'));
            $this->line('  RSSI: '.($existingRssi ? "exists (v{$existingRssi->version})" : 'would generate v1'));

            return self::SUCCESS;
        }

        try {
            $hadFiveDisease = DistrictReportVersion::query()
                ->where('district_id', $district->id)
                ->where('week_start', $weekStart)
                ->exists();
            $hadRssi = DistrictRssiReportVersion::query()
                ->where('district_id', $district->id)
                ->where('week_start', $weekStart)
                ->exists();

            $fiveDisease = $fiveDiseaseWorkflow->prepareScheduled($district, $week, $forceRefresh);
            $rssi = $rssiWorkflow->prepareScheduled($district, $week, $forceRefresh);

            $createdAny = ! $hadFiveDisease || ! $hadRssi || $forceRefresh;
            $this->recordAutomationRun($district->id, $week, 'success', null);

            if ($createdAny) {
                $audit->handle(
                    SecurityAudit::ACTION_WEEKLY_REPORTS_GENERATED,
                    SecurityAudit::OUTCOME_SUCCESS,
                    metadata: [
                        'district_code' => $district->code,
                        'week' => $week,
                        'five_disease_version' => $fiveDisease->version,
                        'rssi_version' => $rssi->version,
                        'force_refresh' => $forceRefresh,
                    ],
                );
            }

            $this->info("Weekly reports ready for {$week}: 5-Disease v{$fiveDisease->version}, RSSI v{$rssi->version}.");

            return self::SUCCESS;
        } catch (\Throwable $exception) {
            report($exception);
            $this->recordAutomationRun($district->id, $week, 'failed', 'Weekly report generation failed; check application logs.');
            $audit->handle(
                SecurityAudit::ACTION_WEEKLY_REPORTS_GENERATED,
                SecurityAudit::OUTCOME_FAILURE,
                metadata: [
                    'district_code' => $district->code,
                    'week' => $week,
                ],
            );
            $this->error("Failed to generate weekly reports for {$week}.");

            return self::FAILURE;
        }
    }

    private function recordAutomationRun(int $districtId, string $week, string $status, ?string $error): void
    {
        $now = now()->utc();
        $exists = DB::table('district_reporting_settings')->where('district_id', $districtId)->exists();
        if ($exists) {
            DB::table('district_reporting_settings')->where('district_id', $districtId)->update([
                'last_auto_generated_at' => $now,
                'last_auto_status' => $status,
                'last_auto_week' => $week,
                'last_auto_error' => $error,
                'updated_at' => $now,
            ]);

            return;
        }

        DB::table('district_reporting_settings')->insert([
            'district_id' => $districtId,
            'reminder_day' => null,
            'reminder_time' => null,
            'auto_generate_enabled' => true,
            'auto_generate_day' => self::DEFAULT_DAY,
            'auto_generate_time' => self::DEFAULT_TIME,
            'last_auto_generated_at' => $now,
            'last_auto_status' => $status,
            'last_auto_week' => $week,
            'last_auto_error' => $error,
            'office_reference' => null,
            'updated_by_id' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}
