<?php

namespace App\Http\Requests;

use App\Models\Report;

class DashboardSummaryRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'month' => [
                'sometimes',
                'date_format:Y-m',
                'regex:/^\\d{4}-(0[1-9]|1[0-2])$/',
            ],
        ];
    }
}
