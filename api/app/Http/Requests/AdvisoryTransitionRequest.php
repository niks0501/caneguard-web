<?php

namespace App\Http\Requests;

class AdvisoryTransitionRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isOfficeUser() ?? false;
    }

    public function rules(): array
    {
        return [
            'validation_provenance' => ['required_if:status,validated', 'sometimes', 'nullable', 'string', 'max:2000', 'not_regex:/^\\s*$/'],
            'provenance' => ['sometimes', 'nullable', 'string', 'max:2000', 'not_regex:/^\\s*$/'],
            'status' => ['sometimes', 'in:validated,retired'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (! $this->has('validation_provenance') && $this->has('provenance')) {
            $this->merge(['validation_provenance' => $this->input('provenance')]);
        }
    }
}
