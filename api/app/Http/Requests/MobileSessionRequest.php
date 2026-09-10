<?php

namespace App\Http\Requests;

use App\Models\PersonalAccessToken;
use App\Models\User;

class MobileSessionRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === User::ROLE_FIELD_REPORTER
            && $this->user()?->currentAccessToken() instanceof PersonalAccessToken;
    }

    public function rules(): array
    {
        return [];
    }
}
