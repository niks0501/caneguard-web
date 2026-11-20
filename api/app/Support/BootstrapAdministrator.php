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

    /** Not verified and still owed a set-password redemption: a superseded account, or a bootstrap account never redeemed. */
    public static function awaitingPassword(User $user): bool
    {
        if ($user->hasVerifiedEmail()) {
            return false;
        }
        if ($user->bootstrap_superseded_at !== null) {
            return true;
        }

        return self::recorded($user, SecurityAudit::ACTION_ACCOUNT_CREATED)
            && ! SecurityAudit::query()->where('target_user_id', $user->id)
                ->where('action', SecurityAudit::ACTION_PASSWORD_RESET)
                ->where('outcome', SecurityAudit::OUTCOME_SUCCESS)->exists();
    }

    /** A bootstrap administrator whose address was replaced before it set a password. Durable: independent of audit retention. */
    public static function superseded(User $user): bool
    {
        return ! $user->is_active && $user->bootstrap_superseded_at !== null;
    }
}
