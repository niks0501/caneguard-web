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
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || strlen($email) > 255) {
            $this->error('CANEGUARD_BOOTSTRAP_ADMIN_EMAIL is not a valid email address.');

            return self::FAILURE;
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
        $hasActiveAdmin = User::query()->where('role', User::ROLE_ADMIN)->where('is_active', true)->exists();
        if ($hasActiveAdmin) {
            $this->line('Bootstrap admin: an active administrator already exists; skipped.');

            return self::SUCCESS;
        }
        if (User::query()->where('email', $email)->exists()) {
            $this->error('CANEGUARD_BOOTSTRAP_ADMIN_EMAIL belongs to an existing account. Set it to an unused email address and deploy again.');

            return self::FAILURE;
        }
        if (! $this->deliverable((string) config('mail.default'))) {
            $this->error('Bootstrap admin: mail delivery is not configured (MAIL_MAILER is log or array). Configure SMTP and deploy again.');

            return self::FAILURE;
        }

        try {
            DB::transaction(function () use ($audit, $email): void {
                $user = new User(['name' => 'CaneGuard Administrator', 'email' => $email, 'role' => User::ROLE_ADMIN]);
                // Unusable random secret: the administrator sets the real password through the emailed link.
                $user->forceFill(['password' => Str::random(64), 'registration_origin' => 'office_certified', 'email_verified_at' => null])->save();
                $audit->handle(SecurityAudit::ACTION_ACCOUNT_CREATED, SecurityAudit::OUTCOME_SUCCESS, null, $user, [
                    'after' => ['role' => $user->role, 'is_active' => $user->is_active], 'provisioning_channel' => 'bootstrap',
                ]);
                if (Password::broker()->sendResetLink(['email' => $user->email]) !== Password::RESET_LINK_SENT) {
                    throw new \RuntimeException('Set-password email was not sent.');
                }
                $audit->handle(SecurityAudit::ACTION_ACCOUNT_INVITE, SecurityAudit::OUTCOME_SUCCESS, null, $user, [
                    'provisioning_channel' => 'bootstrap',
                ]);
            });
        } catch (\Throwable $e) {
            Log::warning('Bootstrap administrator set-password email could not be sent; no account was created.', ['exception' => $e::class]);
            $this->error('Bootstrap admin: the set-password email could not be sent, so no administrator was created. Fix mail delivery and deploy again.');

            return self::FAILURE;
        }

        $this->line('Bootstrap admin: created and set-password email sent.');

        return self::SUCCESS;
    }

    private function deliverable(string $mailer): bool
    {
        $transport = config("mail.mailers.{$mailer}.transport");
        if (in_array($transport, ['log', 'array'], true)) {
            return false;
        }
        if (in_array($transport, ['failover', 'roundrobin'], true)) {
            return collect(config("mail.mailers.{$mailer}.mailers", []))
                ->every(fn ($member) => $this->deliverable((string) $member));
        }

        return true;
    }
}
