<?php

namespace App\Actions\Auth;

use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;

final class ResetPasswordAction
{
    /**
     * Validate and consume a reset token while holding its row lock.
     *
     * @param  array<string, mixed>  $credentials
     */
    public function handle(array $credentials, Closure $callback): string
    {
        return DB::transaction(function () use ($callback, $credentials): string {
            DB::table((string) config('auth.passwords.users.table', 'password_reset_tokens'))
                ->where('email', $credentials['email'])
                ->lockForUpdate()
                ->first();

            return Password::broker()->reset($credentials, $callback);
        });
    }
}
