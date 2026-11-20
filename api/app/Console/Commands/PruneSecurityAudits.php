<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class PruneSecurityAudits extends Command
{
    protected $signature = 'auth:prune-security-audits';

    protected $description = 'Remove security audit records past the configured retention period, except the invitation records of a bootstrap administrator that is still pending';

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
                    ->orWhere('outcome', '!=', SecurityAudit::OUTCOME_SUCCESS)
                    ->orWhereNotExists(fn ($pending) => $pending->selectRaw('1')->from('users')
                        ->whereColumn('users.id', 'security_audits.target_user_id')
                        ->where('role', User::ROLE_ADMIN)->where('is_active', true)->whereNull('email_verified_at')))
                ->where(fn ($query) => $query->where('outcome', '!=', SecurityAudit::OUTCOME_SUCCESS)
                    ->orWhereNotIn('action', SecurityAudit::ONBOARDING_EVIDENCE_ACTIONS)
                    ->orWhereIn('target_user_id', User::query()->whereNotNull('onboarded_at')->select('id')))
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
