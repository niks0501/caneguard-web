<?php

namespace App\Http\Requests;

use App\Models\Advisory;
use Illuminate\Validation\Rule;

class AdvisoryRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isOfficeUser() ?? false;
    }

    public function rules(): array
    {
        return [
            'code' => [
                'sometimes',
                'required',
                'string',
                'max:64',
                'regex:/^[A-Za-z0-9][A-Za-z0-9._-]*$/',
                Rule::unique('advisories', 'code')->ignore($this->route('advisory')?->getKey()),
            ],
            'title' => ['sometimes', 'required', 'string', 'max:160', 'not_regex:/^\\s*$/'],
            'content' => ['sometimes', 'required', 'string', 'max:10000', 'not_regex:/^\\s*$/'],
            'body' => ['sometimes', 'string', 'max:10000', 'not_regex:/^\\s*$/'],
            'guidance' => ['sometimes', 'string', 'max:10000', 'not_regex:/^\\s*$/'],
            'validation_provenance' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'provenance' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'validation_source' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'status' => ['sometimes', Rule::in(Advisory::statuses())],
        ];
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];
        if (! $this->has('content') && $this->has('body')) {
            $normalized['content'] = $this->input('body');
        }
        if (! $this->has('content') && $this->has('guidance')) {
            $normalized['content'] = $this->input('guidance');
        }
        if (! $this->has('validation_provenance') && $this->has('provenance')) {
            $normalized['validation_provenance'] = $this->input('provenance');
        }
        if (! $this->has('validation_provenance') && $this->has('validation_source')) {
            $normalized['validation_provenance'] = $this->input('validation_source');
        }
        if ($normalized !== []) {
            $this->merge($normalized);
        }

        $trimmed = [];
        foreach (['code', 'title', 'content', 'validation_provenance'] as $field) {
            if ($this->has($field) && is_string($this->input($field))) {
                $trimmed[$field] = trim($this->input($field));
            }
        }
        if ($trimmed !== []) {
            $this->merge($trimmed);
        }
    }
}
