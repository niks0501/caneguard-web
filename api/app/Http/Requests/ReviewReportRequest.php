<?php

namespace App\Http\Requests;

use App\Models\Report;
use App\Models\User;
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
            'field_validation_state' => [
                'sometimes',
                Rule::in([
                    Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                    Report::FIELD_VALIDATION_STATE_ASSIGNED,
                ]),
            ],
            'field_validation_assignee_uuid' => [
                'sometimes',
                'nullable',
                'uuid',
                Rule::exists('users', 'uuid'),
            ],
            'field_validation_target_date' => [
                'sometimes',
                'nullable',
                'date_format:Y-m-d',
            ],
            'action_taken' => [
                'sometimes',
                'nullable',
                Rule::in(Report::actionTakenValues()),
            ],
            'referral_destination' => [
                'sometimes',
                'string',
                'max:160',
                'not_regex:/^\\s*$/',
            ],
            'referral_reference' => [
                'sometimes',
                'string',
                'max:160',
                'not_regex:/^\\s*$/',
            ],
            'referral_date' => [
                'sometimes',
                'date',
            ],
            'referral_note' => [
                'sometimes',
                'nullable',
                'string',
                'max:1000',
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
                'field_validation_state',
                'field_validation_assignee_uuid',
                'field_validation_target_date',
                'action_taken',
                'referral_destination',
                'referral_reference',
                'referral_date',
                'referral_note',
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

            $assignmentSelected = $this->input('field_validation_state') === Report::FIELD_VALIDATION_STATE_ASSIGNED
                || $this->input('status') === Report::STATUS_FOR_FIELD_VALIDATION
                || filled($this->input('field_validation_assignee_uuid'));

            if ($assignmentSelected && blank($this->input('field_validation_assignee_uuid'))) {
                $validator->errors()->add(
                    'field_validation_assignee_uuid',
                    'An eligible field reporter is required when field validation is selected.',
                );
            }

            if (
                $assignmentSelected
                && filled($this->input('field_validation_assignee_uuid'))
                && ! User::query()
                    ->where('uuid', $this->input('field_validation_assignee_uuid'))
                    ->where('role', User::ROLE_FIELD_REPORTER)
                    ->exists()
            ) {
                $validator->errors()->add(
                    'field_validation_assignee_uuid',
                    'The selected assignee must be a field reporter.',
                );
            }

            $report = $this->route('report');
            $requestedCaseState = $this->input(
                'case_state',
                $report instanceof Report
                    ? $report->lifecycleSnapshot()['case_state']
                    : null,
            );
            if ($assignmentSelected && $requestedCaseState !== Report::CASE_STATE_OPEN) {
                $validator->errors()->add(
                    'field_validation_state',
                    'Only open cases can be assigned for field validation.',
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

            $referralFields = [
                'referral_destination',
                'referral_reference',
                'referral_date',
                'referral_note',
            ];
            $hasReferralFields = collect($referralFields)
                ->contains(fn (string $key): bool => array_key_exists($key, $this->all()));
            $report = $this->route('report');
            $referralState = $report instanceof Report
                ? $report->lifecycleSnapshot()['referral_state']
                : Report::REFERRAL_STATE_NOT_REFERRED;
            $selectingReferral = $this->input('action_taken') === Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION;

            if ($referralState === Report::REFERRAL_STATE_NOT_REFERRED
                && $selectingReferral
                && $this->input('case_state') === Report::CASE_STATE_CLOSED
            ) {
                $validator->errors()->add(
                    'case_state',
                    'A referral must remain open while expert input is pending.',
                );
            }

            if ($referralState === Report::REFERRAL_STATE_NOT_REFERRED
                && ($selectingReferral || $hasReferralFields)
            ) {
                if (! $selectingReferral) {
                    $validator->errors()->add(
                        'action_taken',
                        'Select referred for expert validation when recording referral details.',
                    );
                }
                foreach ([
                    'referral_destination' => 'A referral destination is required.',
                    'referral_reference' => 'A referral reference is required.',
                    'referral_date' => 'A referral date is required.',
                ] as $field => $message) {
                    if (blank($this->input($field))) {
                        $validator->errors()->add($field, trim($message));
                    }
                }
            }

            if ($referralState === Report::REFERRAL_STATE_REFERRED
                && array_key_exists('action_taken', $this->all())
                && $this->input('action_taken') !== Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION
            ) {
                $validator->errors()->add(
                    'action_taken',
                    'The referral action remains active until an expert response is recorded.',
                );
            }

            if ($referralState !== Report::REFERRAL_STATE_NOT_REFERRED && $hasReferralFields) {
                $validator->errors()->add(
                    'referral',
                    'Referral details cannot be replaced after the handoff is recorded.',
                );
            }
        });
    }
}
