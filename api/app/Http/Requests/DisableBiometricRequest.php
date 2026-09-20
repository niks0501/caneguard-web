<?php

namespace App\Http\Requests;

class DisableBiometricRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'max:255'],
        ];
    }
}
