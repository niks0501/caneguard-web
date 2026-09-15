<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;

class ExportReportsRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'search' => ['sometimes', 'string', 'max:120'],
            ...ReportFilterRules::rules(),
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
