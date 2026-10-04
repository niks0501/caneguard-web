<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Validation\Rule;

class StaffInvitationRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->canManageStaff() ?? false;
    }

    public function rules(): array
    {
        return [
            'user_uuid' => ['required', 'uuid'],
            'role' => ['required', Rule::in([User::ROLE_FIELD_REPORTER, ...User::officeRoles()])],
            'authority_reference' => ['required', 'string', 'max:255', 'not_regex:/^\\s*$/'],
            'current_password' => ['required', 'string', 'max:255'],
        ];
    }
}
