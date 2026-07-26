<?php

namespace App\Http\Requests;

use App\Models\Report;

class ReportStatusesRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewStatuses', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'updated_after' => ['sometimes', 'date'],
            'sync_before' => ['sometimes', 'date'],
            'cursor' => ['sometimes', 'string'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
