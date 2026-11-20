<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\District;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

/**
 * Run by every production deploy after migrations. Safe to repeat: it only adds
 * what is missing from the environment and never edits or removes existing rows.
 */
final class BootstrapDeployment extends Command
{
    protected $signature = 'caneguard:bootstrap';

    protected $description = 'Create the pilot district and first administrator from environment values when they are missing';

    public function handle(RecordSecurityAudit $audit): int
    {
        $this->district($audit);

        $email = Str::lower(trim((string) config('caneguard.bootstrap_admin.email')));
        if ($email === '') {
            $this->line('Bootstrap admin: CANEGUARD_BOOTSTRAP_ADMIN_EMAIL is not set; skipped.');

            return self::SUCCESS;
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || strlen($email) > 255) {
            $this->error('CANEGUARD_BOOTSTRAP_ADMIN_EMAIL is not a valid email address.');

            return self::FAILURE;
        }

        $this->admin($audit, $email);

        return self::SUCCESS;
    }

    private function district(RecordSecurityAudit $audit): void
    {
        $code = trim((string) config('caneguard.pilot_district_code'));
        if ($code === '') {
            $this->line('Pilot district: CANEGUARD_PILOT_DISTRICT_CODE is not set; skipped.');

            return;
        }

        $name = trim((string) config('caneguard.pilot_district_name')) ?: $code;
        $district = District::query()->firstOrCreate(['code' => $code], ['name' => $name]);
        if ($district->wasRecentlyCreated) {
            $audit->handle(SecurityAudit::ACTION_BOOTSTRAP_DISTRICT, SecurityAudit::OUTCOME_SUCCESS, metadata: [
                'district_id' => $district->id, 'district_code' => $code, 'provisioning_channel' => 'bootstrap',
            ]);
        }
        $this->line($district->wasRecentlyCreated ? "Pilot district: created '{$code}'." : "Pilot district: '{$code}' already exists.");
    }

    private function admin(RecordSecurityAudit $audit, string $email): void
    {
        $existing = User::query()->where('email', $email)->first();
        if ($existing === null) {
            $hasAdmin = User::query()->where('role', User::ROLE_ADMIN)->where('is_active', true)
                ->whereNotNull('email_verified_at')->exists();
            if ($hasAdmin) {
                $this->line('Bootstrap admin: an active administrator already exists; skipped.');

                return;
            }

            $user = DB::transaction(function () use ($audit, $email): User {
                $user = new User([
                    'name' => trim((string) config('caneguard.bootstrap_admin.name')) ?: 'CaneGuard Administrator',
                    'email' => $email,
                    'role' => User::ROLE_ADMIN,
                ]);
                // Unusable random secret: the administrator sets the real password through the emailed link.
                $user->forceFill(['password' => Str::random(64), 'registration_origin' => 'office_certified', 'email_verified_at' => null])->save();
                $audit->handle(SecurityAudit::ACTION_ACCOUNT_CREATED, SecurityAudit::OUTCOME_SUCCESS, null, $user, [
                    'after' => ['role' => $user->role, 'is_active' => $user->is_active], 'provisioning_channel' => 'bootstrap',
                ]);

                return $user;
            });
            $this->line("Bootstrap admin: created {$email}.");
            $this->invite($audit, $user, false);

            return;
        }

        // A bootstrap admin who has not yet set a password gets a fresh link on each deploy, so an expired email is recoverable.
        if ($existing->role === User::ROLE_ADMIN && $existing->is_active && ! $existing->hasVerifiedEmail()) {
            $this->invite($audit, $existing, true);

            return;
        }
        $this->line("Bootstrap admin: {$email} already has an account; skipped.");
    }

    private function invite(RecordSecurityAudit $audit, User $user, bool $resend): void
    {
        $sent = false;
        try {
            $sent = Password::broker()->sendResetLink(['email' => $user->email]) === Password::RESET_LINK_SENT;
        } catch (\Throwable $e) {
            Log::warning('Bootstrap administrator invitation could not be sent.', ['user' => $user->uuid, 'exception' => $e::class]);
        }
        $audit->handle(
            SecurityAudit::ACTION_ACCOUNT_INVITE,
            $sent ? SecurityAudit::OUTCOME_SUCCESS : SecurityAudit::OUTCOME_FAILURE,
            null,
            $user,
            ['provisioning_channel' => 'bootstrap'] + ($resend ? ['resend' => true] : []),
        );
        // Mail delivery is configured separately; a failed send must not block the release.
        $this->line($sent
            ? "Bootstrap admin: set-password email sent to {$user->email}."
            : "Bootstrap admin: set-password email for {$user->email} was not sent; use Forgot password once mail is configured.");
    }
}
