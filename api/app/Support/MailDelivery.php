<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;

/** Whether the default mailer can really deliver: log and array never do, SMTP must require TLS, and a failover or roundrobin needs every member to qualify. */
final class MailDelivery
{
    /** Outside production the log/array mailers stay allowed for local work and tests. */
    public static function canDeliver(): bool
    {
        if (! app()->environment('production')) {
            return true;
        }

        $name = (string) config('mail.default');
        if (! in_array((string) config("mail.mailers.{$name}.transport"), ['failover', 'roundrobin'], true)) {
            return self::deliversDirectly($name);
        }

        $members = array_map('strval', (array) config("mail.mailers.{$name}.mailers", []));

        return $members !== [] && collect($members)->every(fn (string $member): bool => self::deliversDirectly($member));
    }

    /** Issues a reset token only when the mailer can deliver it; a failed send rolls back the token it would have replaced. */
    public static function sendResetLink(array $credentials): string
    {
        if (! self::canDeliver()) {
            return Password::INVALID_USER;
        }

        return DB::transaction(fn (): string => Password::broker()->sendResetLink($credentials));
    }

    private static function deliversDirectly(string $name): bool
    {
        return match ((string) config("mail.mailers.{$name}.transport")) {
            'smtp' => (bool) config("mail.mailers.{$name}.require_tls"),
            '', 'log', 'array', 'failover', 'roundrobin' => false,
            default => true,
        };
    }
}
