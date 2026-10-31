<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;

final class WeeklyRssiExportRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'period_type' => ['sometimes', Rule::in(['weekly', 'monthly', 'custom'])],
            'week' => ['sometimes', 'regex:/^\d{4}-W\d{2}$/'],
            'month' => ['sometimes', 'date_format:Y-m'],
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:from'],
            'format' => ['sometimes', Rule::in(['csv', 'pdf'])],
        ];
    }
}
