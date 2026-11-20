<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\SecurityAudit;
use App\Models\User;
use App\Support\AuthUrlBuilder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use LogicException;

/** Operator fallback when mail cannot deliver: prints a one-time set-password link for an account that has not onboarded; no password is typed or stored in env. */
class IssueSetPasswordLink extends Command
{
    protected $signature = 'auth:set-password-link {email? : Email of an active account that has not completed onboarding (defaults to CANEGUARD_OPERATOR_LINK_EMAIL)}';

    protected $description = 'Print a one-time set-password link for an account that has not completed onboarding (operator fallback when mail is unavailable)';

    public function handle(AuthUrlBuilder $urls, RecordSecurityAudit $audit): int
    {
        $email = trim((string) ($this->argument('email') ?? config('caneguard.auth.operator_link_email')));
        if ($email === '') {
            $this->error('Pass an email, or set CANEGUARD_OPERATOR_LINK_EMAIL.');

            return self::FAILURE;
        }

        $user = User::query()->where('email', strtolower($email))->first();
        if ($user === null || ! $user->is_active) {
            $this->error('No active account matches that email.');

            return self::FAILURE;
        }
        if ($user->hasVerifiedEmail()) {
            $this->error('This account has already completed onboarding. The account holder can use Forgot Password instead.');

            return self::FAILURE;
        }

        try {
            $urls->assertPasswordResetUrl();
        } catch (LogicException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $token = DB::transaction(function () use ($user, $audit): string {
            $token = Password::broker()->createToken($user);
            $audit->handle(SecurityAudit::ACTION_OPERATOR_LINK, SecurityAudit::OUTCOME_SUCCESS, null, $user, ['channel' => 'operator_link']);

            return $token;
        });

        $minutes = (int) config('auth.passwords.'.config('auth.defaults.passwords').'.expire', 60);
        $this->line($urls->passwordReset($user, $token));
        $this->comment("One-time link for {$user->email}; expires in {$minutes} minutes. Share it only with the account holder.");

        return self::SUCCESS;
    }
}
