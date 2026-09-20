<?php

namespace App\Actions\Auth;

use App\Models\SecurityAudit;
use App\Models\User;

final class RecordSecurityAudit
{
    /**
     * Metadata is limited to non-secret audit context by every caller.
     * Passwords, reset values, bearer tokens, and session contents must never
     * be passed to this action.
     *
     * @param  array<string, mixed>  $metadata
     */
    public function handle(
        string $action,
        string $outcome,
        ?User $actor = null,
        ?User $target = null,
        array $metadata = [],
    ): SecurityAudit {
        return SecurityAudit::query()->create([
            'actor_id' => $actor?->getKey(),
            'target_user_id' => $target?->getKey(),
            'action' => $action,
            'outcome' => $outcome,
            'metadata' => $metadata === [] ? null : $metadata,
            'created_at' => now(),
        ]);
    }
}
