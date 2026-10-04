<?php

namespace App\Actions\Auth;

use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\DistrictMembership;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** A complete, explicit replacement of one named identity's district authority. */
final class ReconcileDistrictAccess
{
    public function handle(User $target, District $district, string $role, array $abilities, bool $revoke, string $officeReference, ?User $actor = null): void
    {
        if (! in_array($role, User::roles(), true) || ! in_array($target->role, User::roles(), true)
            || array_diff($abilities, DistrictGrant::ABILITIES) !== []
            || ($abilities !== [] && ($role !== User::ROLE_ADMIN || ! $target->hasVerifiedEmail()))
            || trim($officeReference) === '') {
            throw new \InvalidArgumentException('Unsupported, retired, unverified, or undocumented authority change.');
        }

        DB::transaction(function () use ($target, $district, $role, $abilities, $revoke, $officeReference, $actor): void {
            District::query()->whereKey($district->id)->lockForUpdate()->firstOrFail();
            $target = User::query()->whereKey($target->id)->lockForUpdate()->firstOrFail();
            $oldRole = $target->role;
            $target->forceFill(['role' => $role])->save();
            DistrictMembership::query()->updateOrCreate(
                ['user_id' => $target->id, 'district_id' => $district->id],
                ['revoked_at' => $revoke ? now()->utc() : null],
            );
            foreach (DistrictGrant::ABILITIES as $ability) {
                $grant = DistrictGrant::query()->where('user_id', $target->id)->where('district_id', $district->id)->where('ability', $ability)->first();
                if ($grant !== null) {
                    $grant->update(['revoked_at' => ! $revoke && in_array($ability, $abilities, true) ? null : now()->utc()]);
                } elseif (! $revoke && in_array($ability, $abilities, true)) {
                    DistrictGrant::query()->create(['user_id' => $target->id, 'district_id' => $district->id, 'ability' => $ability]);
                }
            }
            app(RevokeUserAuthentication::class)->handle($target);
            app(RecordSecurityAudit::class)->handle('district_access_changed', SecurityAudit::OUTCOME_SUCCESS, $actor, $target, [
                'actor_role' => $actor?->role,
                'district_id' => $district->id,
                'old_role' => $oldRole,
                'new_role' => $role,
                'abilities' => $revoke ? [] : array_values(array_unique($abilities)),
                'revoked' => $revoke,
                'office_reference' => $officeReference,
                'provisioning_channel' => $actor === null ? 'controlled_console' : 'web',
            ]);
        }, attempts: 3);
    }
}
