<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
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

    /** Issues a reset token only when the mailer can deliver it; a failed send rolls back the token it would have replaced. */
    public static function sendResetLink(array $credentials): string
    {
        if (! self::canDeliver()) {
            return Password::INVALID_USER;
        }

        return DB::transaction(fn (): string => Password::broker()->sendResetLink($credentials));
    }
}
