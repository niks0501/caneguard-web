<?php

namespace App\Http\Requests;

use App\Models\User;

class AuthenticatedUserRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, User::webRoles(), true);
    }

    public function rules(): array
    {
        return [];
    }
}
