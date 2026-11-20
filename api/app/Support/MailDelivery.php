<?php

namespace App\Support;

/** Whether the default mailer can really deliver; log/array transports only pretend. */
final class MailDelivery
{
    private const NON_DELIVERING = ['log', 'array'];

    /** Outside production the log/array mailers stay allowed for local work and tests. */
    public static function canDeliver(): bool
    {
        if (! app()->environment('production')) {
            return true;
        }

        return self::mailerDelivers((string) config('mail.default'), []);
    }

    /** @param  list<string>  $seen */
    private static function mailerDelivers(string $name, array $seen): bool
    {
        $config = config("mail.mailers.{$name}");
        if (! is_array($config) || in_array($name, $seen, true)) {
            return false;
        }
        $transport = (string) ($config['transport'] ?? '');
        if (in_array($transport, ['failover', 'roundrobin'], true)) {
            $members = (array) ($config['mailers'] ?? []);

            return $members !== [] && collect($members)->every(
                fn ($member): bool => self::mailerDelivers((string) $member, [...$seen, $name]),
            );
        }

        return $transport !== '' && ! in_array($transport, self::NON_DELIVERING, true);
    }
}
