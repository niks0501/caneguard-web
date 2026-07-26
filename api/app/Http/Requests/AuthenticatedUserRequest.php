<?php

namespace App\Http\Requests;

use App\Models\User;

class AuthenticatedUserRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, [
            User::ROLE_REVIEWER,
            User::ROLE_ADMIN,
        ], true);
    }

    public function rules(): array
    {
        return [];
    }
}
