<?php

namespace App\Actions\Auth;

use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

final class UpdateWebAccount
{
    public function handle(User $actor, User $target, array $input): User
    {
        if ($actor->is($target)) {
            throw ValidationException::withMessages(['role' => ['You cannot change your own role or account status.']]);
        }
        if (! app(CheckStepUpPassword::class)->handle($actor, $input['current_password'], 'web_account_changed', $target)) {
            throw ValidationException::withMessages(['current_password' => ['The current password is incorrect.']]);
        }

        return DB::transaction(function () use ($actor, $target, $input): User {
            $users = User::query()->whereIn('id', [$actor->id, $target->id])->orderBy('id')->lockForUpdate()->get();
            $manager = $users->firstWhere('id', $actor->id);
            $account = $users->firstWhere('id', $target->id);
            Gate::forUser($manager)->authorize('update', $account);
            abort_unless($manager->access_version === $actor->access_version
                && Hash::check($input['current_password'], $manager->getAuthPassword()), 403);
            abort_if(isset($input['expected_access_version'])
                && $account->access_version !== $input['expected_access_version'], 409);
            $before = ['role' => $account->role, 'is_active' => $account->is_active];
            $account->forceFill(['role' => $input['role'], 'is_active' => $input['is_active']])->save();
            foreach (['role' => SecurityAudit::ACTION_ROLE_CHANGE, 'is_active' => 'account_status_change'] as $field => $action) {
                if ($before[$field] !== $account->{$field}) {
                    app(RecordSecurityAudit::class)->handle($action, SecurityAudit::OUTCOME_SUCCESS, $manager, $account, [
                        'before' => $before,
                        'after' => ['role' => $account->role, 'is_active' => $account->is_active],
                    ]);
                }
            }

            return $account->refresh();
        }, attempts: 3);
    }
}
