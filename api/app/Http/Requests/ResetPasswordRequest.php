<?php

namespace App\Http\Requests;

use App\Rules\PasswordPolicy;
use Illuminate\Support\Str;

class ResetPasswordRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'token' => ['required', 'string', 'max:255'],
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

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => Str::lower(trim((string) $this->input('email'))),
        ]);
    }
}
