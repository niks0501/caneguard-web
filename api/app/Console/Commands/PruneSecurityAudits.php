<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\SecurityAudit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class PruneSecurityAudits extends Command
{
    protected $signature = 'auth:prune-security-audits';

    protected $description = 'Remove security audit records past the configured retention period, except the bootstrap administrator account-created and invite-sent records';

    public function handle(RecordSecurityAudit $audit): int
    {
        $retentionDays = max(1, (int) config('caneguard.security_audit.retention_days', 2555));
        $cutoff = now()->subDays($retentionDays);
        $deleted = DB::transaction(function () use ($audit, $cutoff): int {
            $deleted = SecurityAudit::query()
                ->where('created_at', '<', $cutoff)
                ->where(fn ($query) => $query->whereNull('metadata->provisioning_channel')
                    ->orWhere('metadata->provisioning_channel', '!=', 'bootstrap')
                    ->orWhereNotIn('action', [SecurityAudit::ACTION_ACCOUNT_CREATED, SecurityAudit::ACTION_ACCOUNT_INVITE])
                    ->orWhere('outcome', '!=', SecurityAudit::OUTCOME_SUCCESS))
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
