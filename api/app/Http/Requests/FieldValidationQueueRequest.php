<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;

class FieldValidationQueueRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            ...ReportFilterRules::rules(includeStatus: false, includeQueue: false),
            'queue' => [
                'sometimes',
                Rule::in([
                    Report::QUEUE_NEEDS_VISIT,
                    Report::QUEUE_FOLLOW_UP_DUE,
                    Report::QUEUE_UPCOMING,
                ]),
            ],
            'due_from' => ['sometimes', 'date_format:Y-m-d'],
            'due_to' => [
                'sometimes',
                'date_format:Y-m-d',
                'after_or_equal:due_from',
            ],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'assignment' => ['sometimes', Rule::in(['all', 'mine', 'unassigned'])],
        ];
    }
}
