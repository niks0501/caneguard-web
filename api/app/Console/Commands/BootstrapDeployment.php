<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\District;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Arr;
use Illuminate\Support\ConfigurationUrlParser;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

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
        $this->backfillRedeemedInvites($audit);

        $code = trim((string) config('caneguard.pilot_district_code'));
        $name = trim((string) config('caneguard.pilot_district_name'));
        if ($code === '' || $name === '') {
            $this->error('CANEGUARD_PILOT_DISTRICT_CODE and CANEGUARD_PILOT_DISTRICT_NAME must be set.');

            return self::FAILURE;
        }
        $this->district($audit, $code, $name);

        $email = Str::lower(trim((string) config('caneguard.bootstrap_admin_email')));
        if ($email === '') {
            $this->line('Bootstrap admin: CANEGUARD_BOOTSTRAP_ADMIN_EMAIL is not set; skipped.');

            return self::SUCCESS;
        }
        return $this->admin($audit, $email);
    }

    private function district(RecordSecurityAudit $audit, string $code, string $name): void
    {
        $created = DB::transaction(function () use ($audit, $code, $name): bool {
            $district = District::query()->firstOrCreate(['code' => $code], ['name' => $name]);
            if (! $district->wasRecentlyCreated) {
                return false;
            }
            $audit->handle(SecurityAudit::ACTION_BOOTSTRAP_DISTRICT, SecurityAudit::OUTCOME_SUCCESS, metadata: [
                'district_id' => $district->id, 'district_code' => $code, 'provisioning_channel' => 'bootstrap',
            ]);

            return true;
        });
        $this->line($created ? "Pilot district: created '{$code}'." : "Pilot district: '{$code}' already exists.");
    }

    private function admin(RecordSecurityAudit $audit, string $email): int
    {
        if (User::query()->where('role', User::ROLE_ADMIN)->get()->contains(fn (User $admin) => $admin->isActiveAdmin())) {
            $this->line('Bootstrap admin: an active administrator already exists; skipped.');

            return self::SUCCESS;
        }

        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || strlen($email) > 255) {
            $this->error('CANEGUARD_BOOTSTRAP_ADMIN_EMAIL is not a valid email address.');

            return self::FAILURE;
        }

        $existing = User::query()->where('email', $email)->first();
        if ($existing !== null && ! $this->bootstrapEvent($existing, SecurityAudit::ACTION_ACCOUNT_CREATED)) {
            $this->error('CANEGUARD_BOOTSTRAP_ADMIN_EMAIL belongs to an existing account. Set it to an unused email address and deploy again.');

            return self::FAILURE;
        }
        if ($existing !== null && $this->bootstrapEvent($existing, SecurityAudit::ACTION_ACCOUNT_INVITE)) {
            $this->line('Bootstrap admin: the pending administrator was already sent a set-password email; skipped.');

            return self::SUCCESS;
        }

        if (! $this->deliverable((string) config('mail.default'))) {
            $this->error('Bootstrap admin: mail delivery is not configured (MAIL_MAILER must resolve to smtp). Configure SMTP and deploy again.');

            return self::FAILURE;
        }

        $user = $existing ?? $this->createAdmin($audit, $email);
        $sent = $this->sendSetPasswordEmail($user);
        $audit->handle(SecurityAudit::ACTION_ACCOUNT_INVITE, $sent ? SecurityAudit::OUTCOME_SUCCESS : SecurityAudit::OUTCOME_FAILURE, null, $user, [
            'provisioning_channel' => 'bootstrap',
        ]);
        if (! $sent) {
            $this->error('Bootstrap admin: the set-password email could not be sent. The administrator account is kept; fix mail delivery and deploy again.');

            return self::FAILURE;
        }

        $this->line('Bootstrap admin: set-password email sent.');

        return self::SUCCESS;
    }

    private function createAdmin(RecordSecurityAudit $audit, string $email): User
    {
        return DB::transaction(function () use ($audit, $email): User {
            $user = new User(['name' => 'CaneGuard Administrator', 'email' => $email, 'role' => User::ROLE_ADMIN]);
            // Unusable random secret: the administrator sets the real password through the emailed link.
            $user->forceFill(['password' => Str::random(64), 'registration_origin' => 'office_certified', 'email_verified_at' => null])->save();
            $audit->handle(SecurityAudit::ACTION_ACCOUNT_CREATED, SecurityAudit::OUTCOME_SUCCESS, null, $user, [
                'after' => ['role' => $user->role, 'is_active' => $user->is_active], 'provisioning_channel' => 'bootstrap',
            ]);

            return $user;
        });
    }

    private function sendSetPasswordEmail(User $user): bool
    {
        try {
            return Password::broker()->sendResetLink(['email' => $user->email]) === Password::RESET_LINK_SENT;
        } catch (TransportExceptionInterface $e) {
            Log::warning('Bootstrap administrator set-password email could not be sent.', ['exception' => $e::class]);

            return false;
        }
    }

    private function backfillRedeemedInvites(RecordSecurityAudit $audit): void
    {
        User::query()->where('role', User::ROLE_ADMIN)->whereNotNull('email_verified_at')->get()
            ->filter(fn (User $admin) => $this->bootstrapRecorded($admin, SecurityAudit::ACTION_ACCOUNT_CREATED)
                && ! $this->bootstrapRecorded($admin, SecurityAudit::ACTION_ACCOUNT_INVITE))
            ->each(fn (User $admin) => $audit->handle(SecurityAudit::ACTION_ACCOUNT_INVITE, SecurityAudit::OUTCOME_SUCCESS, null, $admin, [
                'provisioning_channel' => 'bootstrap',
            ]));
    }

    private function bootstrapEvent(User $user, string $action): bool
    {
        if ($user->role !== User::ROLE_ADMIN || ! $user->is_active || $user->hasVerifiedEmail()) {
            return false;
        }

        return $this->bootstrapRecorded($user, $action);
    }

    private function bootstrapRecorded(User $user, string $action): bool
    {
        return SecurityAudit::query()->where('target_user_id', $user->id)->where('action', $action)
            ->where('outcome', SecurityAudit::OUTCOME_SUCCESS)->get()
            ->contains(fn (SecurityAudit $event) => ($event->metadata['provisioning_channel'] ?? null) === 'bootstrap');
    }

    private function deliverable(string $mailer): bool
    {
        $config = (array) config("mail.mailers.{$mailer}", []);
        if (isset($config['url'])) {
            $config = array_merge($config, (new ConfigurationUrlParser)->parseConfiguration($config));
            $config['transport'] = Arr::pull($config, 'driver');
        }

        return ($config['transport'] ?? null) === 'smtp';
    }
}
