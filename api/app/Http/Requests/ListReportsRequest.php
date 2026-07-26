<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;

class ListReportsRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'search' => ['sometimes', 'string', 'max:120'],
            'status' => ['sometimes', Rule::in(Report::reviewStatuses())],
            'predicted_label' => ['sometimes', Rule::in(Report::labels())],
            'barangay' => ['sometimes', 'string', 'max:120'],
            'date_from' => ['sometimes', 'date_format:Y-m-d'],
            'date_to' => [
                'sometimes',
                'date_format:Y-m-d',
                'after_or_equal:date_from',
            ],
            'sort' => [
                'sometimes',
                Rule::in([
                    '-submitted_at',
                    'submitted_at',
                    '-confidence',
                    'confidence',
                ]),
            ],
        ];
    }
}
