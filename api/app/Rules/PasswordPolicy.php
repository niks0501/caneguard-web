<?php

namespace App\Rules;

use Illuminate\Validation\Rules\Password;

final class PasswordPolicy
{
    public static function rule(): Password
    {
        return Password::min((int) config('caneguard.auth.password_min_length', 15))
            ->max((int) config('caneguard.auth.password_max_length', 128))
            ->uncompromised();
    }
}
