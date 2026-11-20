<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\SecurityAudit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class PruneApiTokens extends Command
{
    protected $signature = 'caneguard:prune-api-tokens';

    protected $description = 'Remove API tokens expired for more than 24 hours and record the run';

    public function handle(RecordSecurityAudit $audit): int
    {
        return DB::transaction(function () use ($audit): int {
            $status = $this->call('sanctum:prune-expired', ['--hours' => 24]);
            if ($status !== self::SUCCESS) {
                return $status;
            }

            $audit->handle(SecurityAudit::ACTION_PRUNE_RUN, SecurityAudit::OUTCOME_SUCCESS, metadata: [
                'command' => 'sanctum:prune-expired', 'hours' => 24,
            ]);

            return self::SUCCESS;
        });
    }
}
