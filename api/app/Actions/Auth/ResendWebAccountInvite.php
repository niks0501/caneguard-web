<?php

namespace App\Actions\Auth;

use App\Models\SecurityAudit;
use App\Models\User;
use App\Support\MailDelivery;
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
            $status = MailDelivery::sendInvite($user, User::ROLE_FIELD_REPORTER);
        } catch (\Throwable $e) {
            Log::warning('Account invitation could not be re-sent.', ['user' => $user->uuid, 'exception' => $e::class]);
        }
        if ($status === MailDelivery::NOT_PENDING) {
            return $status;
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
