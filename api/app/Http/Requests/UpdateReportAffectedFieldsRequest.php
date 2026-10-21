<?php

namespace App\Http\Requests;

use App\Models\Report;
use App\Security\DistrictAccess;
use Illuminate\Validation\Rule;

class UpdateReportAffectedFieldsRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        $report = $this->route('report');

        return $report instanceof Report
            && ($this->user()?->can('review', $report) ?? false);
    }

    public function rules(): array
    {
        $report = $this->route('report');
        $pilotDistrictId = app(DistrictAccess::class)->pilotId();
        $allowedDistrictId = $report instanceof Report
            && $pilotDistrictId !== null
            && (int) $report->district_id === $pilotDistrictId
                ? $pilotDistrictId
                : 0;

        return [
            'expected_version' => ['required', 'integer', 'min:0'],
            'affected_fields' => ['present', 'array', 'max:250'],
            'affected_fields.*' => ['required', 'array:field_survey_id,loss_rate_percent'],
            'affected_fields.*.field_survey_id' => [
                'required',
                'integer',
                'distinct',
                Rule::exists('field_surveys', 'id')
                    ->where(fn ($query) => $query->where('district_id', $allowedDistrictId)),
            ],
            'affected_fields.*.loss_rate_percent' => [
                'required',
                'numeric',
                'between:0,100',
            ],
        ];
    }
}
