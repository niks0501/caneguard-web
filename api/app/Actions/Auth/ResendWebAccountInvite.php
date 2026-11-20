<?php

namespace App\Actions\Auth;

use App\Models\SecurityAudit;
use App\Models\User;
use App\Support\MailDelivery;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;

/** Re-sends the set-password link for an admin-issued account that is still unverified. */
final class ResendWebAccountInvite
{
    /** @return string The password broker status (Password::RESET_LINK_SENT when delivered). */
    public function handle(User $actor, User $user): string
    {
        $status = Password::INVALID_USER;
        try {
            $token = null;
            $target = null;
            $issued = DB::transaction(function () use ($user, &$target, &$token): string {
                $locked = User::query()->whereKey($user->id)->lockForUpdate()->first();
                if (! MailDelivery::canDeliver() || $locked === null || ! $locked->is_active || $locked->hasVerifiedEmail()) {
                    return Password::INVALID_USER;
                }
                $broker = Password::broker();
                if ($broker->getRepository()->recentlyCreatedToken($locked)) {
                    return Password::RESET_THROTTLED;
                }
                $target = $locked;
                $token = $broker->createToken($locked);

                return Password::RESET_LINK_SENT;
            });
            if ($issued === Password::RESET_LINK_SENT) {
                $target->sendPasswordResetNotification($token);
            }
            $status = $issued;
        } catch (\Throwable $e) {
            Log::warning('Account invitation could not be re-sent.', ['user' => $user->uuid, 'exception' => $e::class]);
        }
        $sent = $status === Password::RESET_LINK_SENT;
        app(RecordSecurityAudit::class)->handle(
            SecurityAudit::ACTION_ACCOUNT_INVITE,
            $sent ? SecurityAudit::OUTCOME_SUCCESS : SecurityAudit::OUTCOME_FAILURE,
            $actor,
            $user,
            ['resend' => true],
        );

        return $status;
    }
}
