<?php

namespace App\Console\Commands;

use App\Models\SecurityAudit;
use Illuminate\Console\Command;

class PruneSecurityAudits extends Command
{
    protected $signature = 'auth:prune-security-audits';

    protected $description = 'Remove security audit records past the configured retention period';

    public function handle(): int
    {
        $retentionDays = max(1, (int) config('caneguard.security_audit.retention_days', 2555));
        $cutoff = now()->subDays($retentionDays);
        $deleted = SecurityAudit::query()
            ->where('created_at', '<', $cutoff)
            ->delete();

        $this->info("Pruned {$deleted} security audit records.");

        return self::SUCCESS;
    }
}
