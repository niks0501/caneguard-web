<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\SecurityAudit;
use App\Models\User;
use App\Support\AuthUrlBuilder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Password;

/** Operator fallback when mail cannot deliver: prints a one-time set-password link; no password is typed or stored in env. */
class IssueSetPasswordLink extends Command
{
    protected $signature = 'auth:set-password-link {email : Email of an existing active account}';

    protected $description = 'Print a one-time set-password link for an account (operator fallback when mail is unavailable)';

    public function handle(AuthUrlBuilder $urls, RecordSecurityAudit $audit): int
    {
        $user = User::query()->where('email', strtolower(trim((string) $this->argument('email'))))->first();
        if ($user === null || ! $user->is_active) {
            $this->error('No active account matches that email.');

            return self::FAILURE;
        }

        $token = Password::broker()->createToken($user);
        $audit->handle(SecurityAudit::ACTION_ACCOUNT_INVITE, SecurityAudit::OUTCOME_SUCCESS, null, $user, ['channel' => 'operator_link']);

        $minutes = (int) config('auth.passwords.'.config('auth.defaults.passwords').'.expire', 60);
        $this->line($urls->passwordReset($user, $token));
        $this->comment("One-time link for {$user->email}; expires in {$minutes} minutes. Share it only with the account holder.");

        return self::SUCCESS;
    }
}
