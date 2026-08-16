<?php

namespace App\Http\Requests;

use App\Models\Report;

class FieldValidationQueueRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            ...ReportFilterRules::rules(includeStatus: false),
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
