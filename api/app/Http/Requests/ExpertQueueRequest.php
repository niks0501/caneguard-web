<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;

class ExpertQueueRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewExpertQueue', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'search' => ['sometimes', 'string', 'max:120'],
            ...ReportFilterRules::rules(includeQueue: false),
            'sort' => [
                'sometimes',
                Rule::in([
                    '-submitted_at',
                    'submitted_at',
                    'due_soonest',
                ]),
            ],
        ];
    }
}
