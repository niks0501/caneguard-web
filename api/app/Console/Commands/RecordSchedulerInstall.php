<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\SecurityAudit;
use Illuminate\Console\Command;

final class RecordSchedulerInstall extends Command
{
    protected $signature = 'caneguard:record-scheduler-install';

    protected $description = 'Record in the security audit that the deploy installed the scheduler cron entry';

    public function handle(RecordSecurityAudit $audit): int
    {
        $audit->handle(SecurityAudit::ACTION_SCHEDULER_CRON_INSTALLED, SecurityAudit::OUTCOME_SUCCESS, metadata: [
            'provisioning_channel' => 'deploy',
        ]);

        return self::SUCCESS;
    }
}
