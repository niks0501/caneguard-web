<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Contracts\Validation\Validator;
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
            // `status` remains accepted for old clients during the migration.
            // New clients should send the independent fields below instead.
            'status' => [
                'sometimes',
                Rule::in(array_values(array_diff(
                    Report::reviewStatuses(),
                    [Report::STATUS_SUBMITTED_UNVERIFIED],
                ))),
            ],
            'notes' => [
                'sometimes',
                'nullable',
                'string',
                'max:1000',
                'required_if:status,'.Report::STATUS_UNABLE_TO_VERIFY,
            ],
            'authority_classified_condition' => [
                'sometimes',
                'nullable',
                Rule::in(Report::authorityClassifiedConditions()),
            ],
            'verification_outcome' => [
                'sometimes',
                Rule::in(Report::verificationOutcomes()),
            ],
            'action_taken' => [
                'sometimes',
                'nullable',
                Rule::in(Report::actionTakenValues()),
            ],
            'case_state' => [
                'sometimes',
                Rule::in(Report::caseStates()),
            ],
            'metadata_corrections' => [
                'sometimes',
                'array:barangay,farmer_or_farm_owner_name,province,municipality,affected_area_hectares,affected_portion_percent,final_latitude,final_longitude,location_source,gps_accuracy',
                'min:1',
            ],
            'metadata_corrections.barangay' => [
                'sometimes',
                'filled',
                'string',
                'max:120',
            ],
            'metadata_corrections.farmer_or_farm_owner_name' => [
                'sometimes',
                'nullable',
                'string',
                'max:160',
            ],
            'metadata_corrections.province' => [
                'sometimes',
                'nullable',
                'string',
                'max:120',
            ],
            'metadata_corrections.municipality' => [
                'sometimes',
                'nullable',
                'string',
                'max:120',
            ],
            'metadata_corrections.affected_area_hectares' => [
                'sometimes',
                'nullable',
                'numeric',
                'min:0',
            ],
            'metadata_corrections.affected_portion_percent' => [
                'sometimes',
                'nullable',
                'numeric',
                'between:0,100',
            ],
            'metadata_corrections.final_latitude' => [
                'sometimes',
                'nullable',
                'numeric',
                'between:-90,90',
            ],
            'metadata_corrections.final_longitude' => [
                'sometimes',
                'nullable',
                'numeric',
                'between:-180,180',
            ],
            'metadata_corrections.location_source' => [
                'sometimes',
                'nullable',
                Rule::in(['gps', 'manual_map']),
            ],
            'metadata_corrections.gps_accuracy' => [
                'sometimes',
                'nullable',
                'numeric',
                'min:0',
            ],
            'correction_reason' => [
                'sometimes',
                'nullable',
                'string',
                'max:1000',
                'required_with:metadata_corrections',
                'not_regex:/^\\s*$/',
            ],
            'expected_version' => ['required', 'integer', 'min:0'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $decisionKeys = [
                'status',
                'notes',
                'authority_classified_condition',
                'verification_outcome',
                'action_taken',
                'case_state',
                'metadata_corrections',
            ];

            $hasDecision = collect($decisionKeys)
                ->contains(fn (string $key): bool => array_key_exists($key, $this->all()));

            if (! $hasDecision) {
                $validator->errors()->add(
                    'review',
                    'Choose at least one review field to update.',
                );
            }

            if (
                $this->input('verification_outcome') === Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY
                && blank($this->input('notes'))
            ) {
                $validator->errors()->add(
                    'notes',
                    'The notes field is required when verification cannot be completed.',
                );
            }
        });
    }
}
