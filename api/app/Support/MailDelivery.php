<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Throwable;

/** Whether the default mailer can really deliver: log and array never do, and SMTP must require TLS. */
final class MailDelivery
{
    public const NOT_PENDING = 'not_pending';

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

    /**
     * Issues a reset token and sends it. The token commits before SMTP is attempted; if the send fails, the
     * previously issued token rows are restored, so a failed attempt never destroys a working link.
     */
    public static function sendResetLink(array $credentials, bool $onboardingOnly = false): string
    {
        if (! self::canDeliver()) {
            return Password::INVALID_USER;
        }
        app(AuthUrlBuilder::class)->assertPasswordResetUrl();

        $broker = Password::broker();
        $table = (string) config('auth.passwords.users.table', 'password_reset_tokens');
        $user = null;
        $token = null;
        $previous = [];
        $status = DB::transaction(function () use ($broker, $table, $credentials, $onboardingOnly, &$user, &$token, &$previous): string {
            $found = $broker->getUser($credentials);
            if ($found === null) {
                return Password::INVALID_USER;
            }
            $user = User::query()->whereKey($found->getAuthIdentifier())->lockForUpdate()->first();
            if ($user === null) {
                return Password::INVALID_USER;
            }
            if ($onboardingOnly && (! $user->is_active || $user->hasVerifiedEmail())) {
                return self::NOT_PENDING;
            }
            if ($broker->getRepository()->recentlyCreatedToken($user)) {
                return Password::RESET_THROTTLED;
            }
            $previous = DB::table($table)->where('email', $user->email)->get()->map(fn ($row): array => (array) $row)->all();
            $token = $broker->createToken($user);

            return Password::RESET_LINK_SENT;
        });
        if ($status !== Password::RESET_LINK_SENT) {
            return $status;
        }

        try {
            $user->sendPasswordResetNotification($token);
        } catch (Throwable $e) {
            DB::transaction(function () use ($table, $user, $previous): void {
                DB::table($table)->where('email', $user->email)->delete();
                if ($previous !== []) {
                    DB::table($table)->insert($previous);
                }
            });

            throw $e;
        }

        return Password::RESET_LINK_SENT;
    }
}
