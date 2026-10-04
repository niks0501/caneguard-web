<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Validation\Rule;

class ChangeUserRoleRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->canManageStaff() ?? false;
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'max:255'],
            'role' => ['required', 'string', Rule::in([User::ROLE_FARMER])],
        ];
    }
}
