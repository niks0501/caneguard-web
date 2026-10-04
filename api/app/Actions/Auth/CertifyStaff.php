<?php

namespace App\Actions\Auth;

use App\Models\SecurityAudit;
use App\Models\StaffInvitation;
use App\Models\User;

// Called only inside the roster/invitation transaction, never from public signup.
final class CertifyStaff
{
    public function handle(User $target, User $actor, string $role, string $reference): void
    {
        $oldRole = $target->role;
        $target->forceFill([
            'role' => $role,
            'staff_certified_at' => now(),
            'staff_certified_by' => $actor->id,
            'staff_authority_reference' => $reference,
        ])->save();

        StaffInvitation::query()->where('user_id', $target->id)
            ->whereNull('accepted_at')->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
        app(RevokeUserAuthentication::class)->handle($target);
        app(RecordSecurityAudit::class)->handle(
            'staff_certification', SecurityAudit::OUTCOME_SUCCESS,
            actor: $actor, target: $target,
            metadata: ['old_role' => $oldRole, 'new_role' => $role, 'authority_reference' => $reference],
        );
    }
}
