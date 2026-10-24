<?php

namespace App\Http\Requests;

class ListFieldSurveysRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasWebAccess() ?? false;
    }

    public function rules(): array
    {
        return [
            'limit' => [
                'sometimes',
                'integer',
                'min:1',
                'max:'.(int) config('caneguard.surveys.read_max_limit', 250),
            ],
            'page' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            // Boundary id, inspector name, or an ISO date of capture.
            'search' => ['sometimes', 'nullable', 'string', 'max:60'],
        ];
    }
}
