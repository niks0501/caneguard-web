<?php

namespace App\Http\Requests;

use App\Models\User;

class MobileSessionRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === User::ROLE_FIELD_REPORTER;
    }

    public function rules(): array
    {
        return [];
    }
}
