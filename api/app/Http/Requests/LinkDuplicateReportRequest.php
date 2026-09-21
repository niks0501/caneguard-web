<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;

class LinkDuplicateReportRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        $report = $this->route('report');

        return $report instanceof Report
            && ($this->user()?->can('linkDuplicate', $report) ?? false);
    }

    public function rules(): array
    {
        return [
            'canonical_report_uuid' => $this->isMethod('delete')
                ? ['prohibited']
                : [
                    'required',
                    'uuid',
                    Rule::exists('reports', 'uuid'),
                ],
            'reason' => [
                'sometimes',
                'nullable',
                'string',
                'max:1000',
            ],
            'expected_version' => ['required', 'integer', 'min:0'],
        ];
    }
}
