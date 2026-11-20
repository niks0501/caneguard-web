<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\SecurityAudit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;

final class RecordSchedulerInstall extends Command
{
    protected $signature = 'caneguard:record-scheduler-install {cron_line}';

    protected $description = 'Record in the security audit that the deploy scheduler cron entry is installed, once per entry';

    public function handle(RecordSecurityAudit $audit): int
    {
        $line = (string) $this->argument('cron_line');
        $crontab = Process::run(['crontab', '-l']);
        $installed = $crontab->successful() && in_array($line, array_map('trim', explode("\n", $crontab->output())), true);
        if (! $installed) {
            $this->error('The scheduler entry is not installed in the deploy user crontab; nothing was recorded.');

            return self::FAILURE;
        }

        $recorded = SecurityAudit::query()
            ->where('action', SecurityAudit::ACTION_SCHEDULER_CRON_INSTALLED)
            ->get()
            ->contains(fn (SecurityAudit $row) => ($row->metadata['cron_line'] ?? null) === $line);
        if (! $recorded) {
            $audit->handle(SecurityAudit::ACTION_SCHEDULER_CRON_INSTALLED, SecurityAudit::OUTCOME_SUCCESS, metadata: [
                'cron_line' => $line, 'provisioning_channel' => 'deploy',
            ]);
        }

        return self::SUCCESS;
    }
}
