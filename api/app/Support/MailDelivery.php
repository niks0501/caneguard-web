<?php

namespace App\Support;

use Illuminate\Support\Facades\Password;

/** Whether the default mailer can really deliver; log/array transports only pretend, and failover can fall back to log. */
final class MailDelivery
{
    private const NON_DELIVERING = ['log', 'array', 'failover'];

    /** Outside production the log/array mailers stay allowed for local work and tests. */
    public static function canDeliver(): bool
    {
        if (! app()->environment('production')) {
            return true;
        }

        $transport = (string) config('mail.mailers.'.config('mail.default').'.transport');

        return $transport !== '' && ! in_array($transport, self::NON_DELIVERING, true);
    }

    /** Issues a reset token only when the mailer can deliver it; otherwise nothing changes and no token replaces another. */
    public static function sendResetLink(array $credentials): string
    {
        return self::canDeliver() ? Password::broker()->sendResetLink($credentials) : Password::INVALID_USER;
    }
}
