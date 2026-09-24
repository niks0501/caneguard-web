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
            // Payload split (dashboard overhaul P1): first paint needs only
            // counts/queues/recent. Monthly aggregates and the triage
            // calibration are opt-in so tab-focus refetches stay cheap.
            'include' => [
                'sometimes',
                'string',
                'max:64',
                'regex:/^[a-z_,]+$/',
            ],
            'recent_limit' => [
                'sometimes',
                'integer',
                'min:1',
                'max:25',
            ],
        ];
    }
}
