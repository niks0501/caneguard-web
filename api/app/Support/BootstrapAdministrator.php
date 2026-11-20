<?php

namespace App\Support;

use App\Models\SecurityAudit;
use App\Models\User;

final class BootstrapAdministrator
{
    public static function recorded(User $user, string $action): bool
    {
        return SecurityAudit::query()->where('target_user_id', $user->id)->where('action', $action)
            ->where('outcome', SecurityAudit::OUTCOME_SUCCESS)->get()
            ->contains(fn (SecurityAudit $event) => ($event->metadata['provisioning_channel'] ?? null) === 'bootstrap');
    }

    /** Created by the deployment bootstrap and not yet verified: only a set-password redemption can onboard it. */
    public static function awaitingPassword(User $user): bool
    {
        return ! $user->hasVerifiedEmail() && self::recorded($user, SecurityAudit::ACTION_ACCOUNT_CREATED);
    }

    /** A bootstrap administrator whose address was replaced before it set a password. */
    public static function superseded(User $user): bool
    {
        return ! $user->is_active && self::awaitingPassword($user);
    }
}
