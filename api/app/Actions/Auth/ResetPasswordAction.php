<?php

namespace App\Actions\Auth;

use App\Models\User;
use App\Support\BootstrapAdministrator;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;

final class ResetPasswordAction
{
    /**
     * Validate and consume a reset token, holding the account row lock before the token row lock.
     *
     * @param  array<string, mixed>  $credentials
     */
    public function handle(array $credentials, Closure $callback): string
    {
        return DB::transaction(function () use ($callback, $credentials): string {
            $user = User::query()->where('email', $credentials['email'])->lockForUpdate()->first();
            DB::table((string) config('auth.passwords.users.table', 'password_reset_tokens'))
                ->where('email', $credentials['email'])
                ->lockForUpdate()
                ->first();

            if ($user instanceof User && BootstrapAdministrator::superseded($user)) {
                return Password::INVALID_TOKEN;
            }

            return Password::broker()->reset($credentials, $callback);
        });
    }
}
