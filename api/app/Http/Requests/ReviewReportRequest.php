<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;

class ReviewReportRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        $report = $this->route('report');

        return $report instanceof Report
            && ($this->user()?->can('review', $report) ?? false);
    }

    public function rules(): array
    {
        return [
            'status' => [
                'required',
                Rule::in([
                    Report::STATUS_FOR_FIELD_VALIDATION,
                    Report::STATUS_VERIFIED_BY_STAFF,
                    Report::STATUS_UNABLE_TO_VERIFY,
                    Report::STATUS_RESOLVED,
                ]),
            ],
            'notes' => [
                'nullable',
                'string',
                'max:1000',
                'required_if:status,'.Report::STATUS_UNABLE_TO_VERIFY,
            ],
            'expected_version' => ['required', 'integer', 'min:0'],
        ];
    }
}
