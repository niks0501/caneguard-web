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
                ]),
            ],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
