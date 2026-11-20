<?php

namespace App\Support;

use App\Models\User;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Throwable;

/** Whether the default mailer can really deliver: log and array never do, and SMTP must require TLS. */
final class MailDelivery
{
    public const NOT_PENDING = 'not_pending';

    /** Every reset-link request and redemption takes at least this long, so the response reveals no account or token state. */
    public const TIMEBOX_MICROSECONDS = 200000;

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

        return ! in_array($transport, ['', 'log', 'array', 'failover'], true);
    }

    /** Public recovery resolves the account by email, as Laravel's broker does. */
    public static function sendResetLink(string $email): string
    {
        return self::issue(fn () => User::query()->where('email', $email), onboardingOnly: false, role: null);
    }

    /** An invite is bound to the selected account, and its role and onboarding are rechecked under the account lock. */
    public static function sendInvite(User $user, ?string $role = null): string
    {
        return self::issue(fn () => User::query()->whereKey($user->getKey()), onboardingOnly: true, role: $role);
    }

    /**
     * Issues a reset token and sends it. The token commits before SMTP is attempted. If the send fails, the rows
     * it replaced are put back only while the failed token is still the current one, so a later link, or a link
     * already used to reset the password, is never overwritten or revived.
     */
    private static function issue(Closure $lookup, bool $onboardingOnly, ?string $role): string
    {
        $broker = Password::broker();
        $table = (string) config('auth.passwords.users.table', 'password_reset_tokens');
        $user = null;
        $token = null;
        $issuedHash = null;
        $previous = [];
        $status = RollbackBarrier::issue(function () use ($broker, $table, $lookup, $onboardingOnly, $role, &$user, &$token, &$issuedHash, &$previous): string {
            // The account lock is taken before any other read, so the throttle and the rollback snapshot see committed token state.
            $user = $lookup()->lockForUpdate()->first();
            if ($onboardingOnly && $user !== null && (! $user->is_active || $user->hasCompletedOnboarding() || ($role !== null && $user->role !== $role))) {
                return self::NOT_PENDING;
            }
            if (! self::canDeliver()) {
                return Password::INVALID_USER;
            }
            app(AuthUrlBuilder::class)->assertPasswordResetUrl();
            if ($user === null) {
                return Password::INVALID_USER;
            }
            if ($broker->getRepository()->recentlyCreatedToken($user)) {
                return Password::RESET_THROTTLED;
            }
            $previous = DB::table($table)->where('email', $user->email)->get()->map(fn ($row): array => (array) $row)->all();
            $token = self::issueToken($user);
            $issuedHash = DB::table($table)->where('email', $user->email)->value('token');

            return Password::RESET_LINK_SENT;
        }) ?? Password::INVALID_USER;
        if ($status !== Password::RESET_LINK_SENT) {
            return $status;
        }

        try {
            $user->sendPasswordResetNotification($token);
        } catch (Throwable $e) {
            DB::transaction(function () use ($table, $user, $previous, $issuedHash): void {
                User::query()->whereKey($user->getKey())->lockForUpdate()->first();
                $removed = DB::table($table)->where('email', $user->email)->where('token', $issuedHash)->delete();
                if ($removed === 1 && $previous !== []) {
                    DB::table($table)->insert($previous);
                }
            });

            throw $e;
        }

        return Password::RESET_LINK_SENT;
    }

    /** Every reset token records its issuing account, so redemption can refuse a token whose account the email no longer selects. */
    public static function issueToken(User $user): string
    {
        $token = Password::broker()->createToken($user);
        DB::table((string) config('auth.passwords.users.table', 'password_reset_tokens'))
            ->where('email', $user->email)
            ->update(['user_id' => $user->getKey()]);

        return $token;
    }

    /** Revokes one address's outstanding links, or every link when no address is given. */
    public static function revokeResetTokens(?string $email = null): int
    {
        $query = DB::table((string) config('auth.passwords.users.table', 'password_reset_tokens'));
        if ($email !== null) {
            $query->where('email', $email);
        }

        return $query->delete();
    }
}
