<?php

namespace App\Http\Requests;

use App\Rules\PasswordPolicy;

class ChangePasswordRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'max:255'],
            'password' => [
                'required',
                'string',
                PasswordPolicy::rule(),
            ],
            'password_confirmation' => [
                'sometimes',
                'required',
                'string',
                'same:password',
            ],
        ];
    }
}
