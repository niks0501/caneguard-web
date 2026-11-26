<?php

namespace App\Actions\Auth;

use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Disable, re-enable or re-home a farmer account. Farmers hold no district
 * membership or grants, so this is a small locked transaction rather than the
 * inspector access workflow. Disabling revokes every session and bearer token.
 */
final class UpdateFarmerAccount
{
    /** @param array{current_password: string, expected_access_version: int, is_active?: bool, barangay?: ?string} $input */
    public function handle(User $actor, User $target, array $input): User
    {
        abort_unless($target->role === User::ROLE_FARMER, 404);
        if (! app(CheckStepUpPassword::class)->handle($actor, $input['current_password'], 'farmer_account_changed', $target)) {
            throw ValidationException::withMessages(['current_password' => ['The current password is incorrect.']]);
        }

        return DB::transaction(function () use ($actor, $target, $input): User {
            $users = User::query()->whereIn('id', [$actor->id, $target->id])->orderBy('id')->lockForUpdate()->get();
            $manager = $users->firstWhere('id', $actor->id);
            $farmer = $users->firstWhere('id', $target->id);
            Gate::forUser($manager)->authorize('manageFarmer', $farmer);
            abort_unless($manager->access_version === $actor->access_version
                && Hash::check($input['current_password'], $manager->getAuthPassword()), 403);
            abort_if($farmer->access_version !== $input['expected_access_version'], 409);

            $before = ['is_active' => $farmer->is_active, 'barangay' => $farmer->barangay];
            $changes = array_intersect_key($input, ['is_active' => true, 'barangay' => true]);
            $farmer->forceFill($changes);
            if (! $farmer->isDirty()) {
                return $farmer;
            }
            $disabling = $before['is_active'] && ! $farmer->is_active;
            $farmer->access_version++;
            $farmer->save();
            if ($disabling) {
                app(RevokeUserAuthentication::class)->handle($farmer);
            }
            $after = ['is_active' => $farmer->is_active, 'barangay' => $farmer->barangay];
            app(RecordSecurityAudit::class)->handle(
                $before['is_active'] !== $after['is_active'] ? 'account_status_change' : 'web_account_changed',
                SecurityAudit::OUTCOME_SUCCESS,
                $manager,
                $farmer,
                ['before' => $before, 'after' => $after + ['role' => $farmer->role]],
            );

            return $farmer->refresh();
        }, attempts: 3);
    }
}
