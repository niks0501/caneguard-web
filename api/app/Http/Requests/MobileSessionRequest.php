<?php

namespace App\Http\Requests;

use App\Models\PersonalAccessToken;
use App\Models\User;

class MobileSessionRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }

        if ($this->bearerToken() !== null) {
            return $user->role === User::ROLE_FIELD_REPORTER
                && $user->currentAccessToken() instanceof PersonalAccessToken;
        }

        return true;
    }

    public function rules(): array
    {
        return [];
    }
}
