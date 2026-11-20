<?php

namespace App\Support;

use Illuminate\Support\Facades\Password;

/** Whether the default mailer can really deliver: log and array never do, and SMTP must require TLS. */
final class MailDelivery
{
    /** Outside production the log/array mailers stay allowed for local work and tests. */
    public static function canDeliver(): bool
    {
        if (! app()->environment('production')) {
            return true;
        }

        $name = (string) config('mail.default');
        $transport = (string) config("mail.mailers.{$name}.transport");
        if ($transport === 'smtp') {
            return (bool) config("mail.mailers.{$name}.require_tls");
        }

        return ! in_array($transport, ['', 'log', 'array'], true);
    }

    /** Issues a reset token only when the mailer can deliver it. The token commits before SMTP is attempted, so a failed send leaves a live token to resend. */
    public static function sendResetLink(array $credentials): string
    {
        if (! self::canDeliver()) {
            return Password::INVALID_USER;
        }

        return Password::broker()->sendResetLink($credentials);
    }
}
