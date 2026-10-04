<?php

namespace App\Http\Requests;

class EnrollMobileDeviceRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isMobileUser() === true
            && $this->user()->hasVerifiedEmail();
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'max:255'],
            'device_name' => ['required', 'string', 'max:120', 'not_regex:/[\r\n]/'],
            'device_id' => ['required', 'string', 'max:191', 'not_regex:/^\s*$/'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'device_name' => trim((string) $this->input('device_name')),
            'device_id' => trim((string) $this->input('device_id')),
        ]);
    }
}
