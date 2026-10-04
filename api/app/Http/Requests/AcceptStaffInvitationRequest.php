<?php

namespace App\Http\Requests;

class AcceptStaffInvitationRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'token' => ['required', 'string', 'size:64', 'regex:/^[a-f0-9]+$/'],
            'email' => ['required', 'email', 'max:255'],
            'current_password' => ['required', 'string', 'max:255'],
        ];
    }
}
