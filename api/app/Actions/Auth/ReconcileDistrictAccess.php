<?php

namespace App\Actions\Auth;

use App\Models\AccountAccessEvent;
use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\DistrictMembership;
use App\Models\SecurityAudit;
use App\Models\User;
use App\Security\AccountsDirectory;
use App\Security\DistrictAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** One complete, explicit authority decision, shared by console, v1 and v2. */
final class ReconcileDistrictAccess
{
    public function handle(User $target, District $district, string $role, array $abilities, bool $revoke, string $officeReference, ?User $actor = null, string $action = 'replace', ?string $operationId = null): ?AccountAccessEvent
    {
        if (! in_array($role, User::roles(), true) || ! in_array($target->role, User::roles(), true)
            || array_diff($abilities, DistrictGrant::ABILITIES) !== [] || count(array_unique($abilities)) !== count($abilities)
            || ($abilities !== [] && ($role !== User::ROLE_ADMIN || ! $target->hasVerifiedEmail()))
            || ($revoke && $abilities !== []) || trim($officeReference) === '') {
            throw new \InvalidArgumentException('Unsupported, retired, unverified, or undocumented authority change.');
        }

        return DB::transaction(function () use ($target, $district, $role, $abilities, $revoke, $officeReference, $actor, $action, $operationId): ?AccountAccessEvent {
            District::query()->whereKey($district->id)->lockForUpdate()->firstOrFail();
            $targetProof = $target;
            $users = User::query()->whereIn('id', array_filter([$actor?->id, $target->id]))->orderBy('id')->lockForUpdate()->get();
            $target = $users->firstWhere('id', $target->id);
            if ($actor !== null && $target->access_version !== $targetProof->access_version) {
                AccountAccessFailure::reject('ACCESS_VERSION_CONFLICT', 'Target authority changed. Reload and review again.');
            }
            if (! in_array($target->role, User::roles(), true)) {
                AccountAccessFailure::reject('INVALID_ACCESS_TRANSITION', 'Unsupported role requires operator reconciliation.', 422);
            }
            if ($actor !== null) {
                $proof = $actor;
                $actor = $users->firstWhere('id', $actor->id);
                if ($actor->access_version !== $proof->access_version || $actor->getAuthPassword() !== $proof->getAuthPassword()) {
                    AccountAccessFailure::reject('ACCESS_VERSION_CONFLICT', 'Manager authority changed. Sign in and review again.');
                }
                if ($actor->is($target)) {
                    AccountAccessFailure::reject('SELF_CHANGE_FORBIDDEN', 'You cannot change your own authority.', 403);
                }
                abort_unless(app(DistrictAccess::class)->grant($actor, 'staff:manage', $district->id, lock: true) !== null, 403);
                abort_if(DistrictMembership::query()->where('user_id', $target->id)->where('district_id', '!=', $district->id)->lockForUpdate()->get()->isNotEmpty()
                    || DistrictGrant::query()->where('user_id', $target->id)->where('district_id', '!=', $district->id)->lockForUpdate()->get()->isNotEmpty(), 404);
            }
            // Re-read verification under the same lock as the authority write.
            if ($abilities !== [] && ! $target->hasVerifiedEmail()) {
                AccountAccessFailure::reject('EMAIL_NOT_VERIFIED', 'Email must be verified before issuing keys.', 422);
            }
            $revoke = $revoke || $role === User::ROLE_FARMER;
            $directory = app(AccountsDirectory::class);
            $before = $directory->snapshot($target, lock: true);
            if (array_diff(array_column($before['grants'], 'ability'), DistrictGrant::ABILITIES) !== []) {
                AccountAccessFailure::reject('INVALID_ACCESS_TRANSITION', 'Unsupported stored keys require operator reconciliation.', 422);
            }
            $active = array_column(array_filter($before['grants'], fn ($g) => ! $g['revoked']), 'ability');
            sort($active);
            sort($abilities);
            $desiredState = $revoke ? 'revoked' : 'active';
            if ($before['role'] === $role && $before['membership_state'] === $desiredState && $active === $abilities) {
                return null;
            }
            if (! $revoke && in_array('report:approve', $abilities, true)
                && DistrictGrant::query()->where('district_id', $district->id)->where('ability', 'report:approve')
                    ->whereNull('revoked_at')->where('user_id', '!=', $target->id)->lockForUpdate()->first() !== null) {
                AccountAccessFailure::reject('APPROVER_ALREADY_ASSIGNED', 'Transfer the existing approval key instead of issuing a second key.');
            }
            if ($actor !== null && in_array('staff:manage', $active, true)
                && ($revoke || $role !== User::ROLE_ADMIN || ! in_array('staff:manage', $abilities, true))
                && ! $this->otherManager($district, $target)) {
                AccountAccessFailure::reject('LAST_MANAGER_PROTECTED', 'The last staff manager requires controlled operator handover.');
            }
            $target->forceFill(['role' => $role])->save();
            $membership = DistrictMembership::query()->firstOrNew(['user_id' => $target->id, 'district_id' => $district->id]);
            if (! $membership->exists || ($membership->revoked_at === null) !== ! $revoke) {
                $membership->revoked_at = $revoke ? now()->utc() : null;
                $membership->save();
            }
            foreach (DistrictGrant::ABILITIES as $ability) {
                $grant = DistrictGrant::query()->where('user_id', $target->id)->where('district_id', $district->id)->where('ability', $ability)->first();
                $wanted = ! $revoke && in_array($ability, $abilities, true);
                if ($grant !== null && ($grant->revoked_at === null) !== $wanted) {
                    $grant->update(['revoked_at' => $wanted ? null : now()->utc()]);
                } elseif ($grant === null && $wanted) {
                    DistrictGrant::query()->create(['user_id' => $target->id, 'district_id' => $district->id, 'ability' => $ability]);
                }
            }
            $target->refresh();
            // A role-only or membership-only change still invalidates old credentials.
            app(RevokeUserAuthentication::class)->handle($target);
            $event = AccountAccessEvent::query()->create([
                'operation_id' => $operationId ?? (string) Str::uuid(), 'district_id' => $district->id,
                'target_id' => $target->id, 'actor_id' => $actor?->id,
                'contract_version' => 'account-access-event-v1', 'action' => $revoke ? 'revoke' : $action,
                'office_reference' => trim($officeReference), 'before' => $before, 'after' => $directory->snapshot($target, lock: true),
                'actor_snapshot' => $actor === null ? ['channel' => 'controlled_console'] : ['uuid' => $actor->uuid, 'name' => $actor->name, 'role' => $actor->role],
                'occurred_at' => now()->utc(),
            ]);
            app(RecordSecurityAudit::class)->handle('district_access_changed', SecurityAudit::OUTCOME_SUCCESS, $actor, $target, [
                'district_id' => $district->id, 'old_role' => $before['role'], 'new_role' => $role,
                'abilities' => $abilities, 'revoked' => $revoke, 'office_reference' => trim($officeReference),
                'provisioning_channel' => $actor === null ? 'controlled_console' : 'web', 'event_id' => $event->id,
            ]);

            return $event;
        }, attempts: 3);
    }

    private function otherManager(District $district, User $target): bool
    {
        return User::query()->where('id', '!=', $target->id)->where('role', User::ROLE_ADMIN)->whereNotNull('email_verified_at')
            ->whereHas('districtMemberships', fn ($q) => $q->where('district_id', $district->id)->whereNull('revoked_at'))
            ->whereHas('districtGrants', fn ($q) => $q->where('district_id', $district->id)->where('ability', 'staff:manage')->whereNull('revoked_at'))->exists();
    }
}
