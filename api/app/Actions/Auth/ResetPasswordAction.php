<?php

namespace App\Actions\Auth;

use App\Models\User;
use App\Support\BootstrapAdministrator;
use App\Support\MailDelivery;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Timebox;

final class ResetPasswordAction
{
    /**
     * Validate and consume a reset token, holding the account row lock before the token row lock.
     *
     * @param  array<string, mixed>  $credentials
     */
    public function handle(array $credentials, Closure $callback): string
    {
        return (new Timebox)->call(fn (): string => DB::transaction(function () use ($callback, $credentials): string {
            $account = User::query()->where('email', $credentials['email'])->lockForUpdate()->first();
            $token = DB::table((string) config('auth.passwords.users.table', 'password_reset_tokens'))
                ->where('email', $credentials['email'])
                ->lockForUpdate()
                ->first();
            if ($account === null || $token === null || (int) $token->user_id !== (int) $account->getKey()) {
                return Password::INVALID_TOKEN;
            }

            if (BootstrapAdministrator::superseded($account)) {
                return Password::INVALID_TOKEN;
            }

            $repository = Password::broker()->getRepository();
            if (! $repository->exists($account, $credentials['token'])) {
                return Password::INVALID_TOKEN;
            }

            $callback($account, $credentials['password']);
            $repository->delete($account);

            return Password::PASSWORD_RESET;
        }), MailDelivery::TIMEBOX_MICROSECONDS);
    }
}
