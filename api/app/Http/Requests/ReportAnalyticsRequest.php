<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;

final class ReportAnalyticsRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'granularity' => ['sometimes', Rule::in(['day', 'week'])],
            'comparison' => ['sometimes', Rule::in(['previous_month'])],
            'search' => ['sometimes', 'string', 'max:120'],
            ...ReportFilterRules::rules(),
        ];
    }
}
