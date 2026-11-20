<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\SecurityAudit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class PruneSecurityAudits extends Command
{
    protected $signature = 'auth:prune-security-audits';

    protected $description = 'Remove security audit records past the configured retention period';

    public function handle(RecordSecurityAudit $audit): int
    {
        $retentionDays = max(1, (int) config('caneguard.security_audit.retention_days', 2555));
        $cutoff = now()->subDays($retentionDays);
        $deleted = DB::transaction(function () use ($audit, $cutoff): int {
            $deleted = SecurityAudit::query()
                ->where('created_at', '<', $cutoff)
                ->where(fn ($query) => $query->whereNull('metadata')
                    ->orWhereJsonDoesntContain('metadata->provisioning_channel', 'bootstrap'))
                ->delete();

            $audit->handle(SecurityAudit::ACTION_PRUNE_RUN, SecurityAudit::OUTCOME_SUCCESS, metadata: [
                'command' => 'auth:prune-security-audits', 'deleted' => $deleted,
            ]);

            return $deleted;
        });
        $this->info("Pruned {$deleted} security audit records.");

        return self::SUCCESS;
    }
}
