<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;

final class ReportFilterRules
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public static function rules(
        bool $includeStatus = true,
        bool $includeQueue = true,
    ): array {
        $rules = [
            'predicted_label' => ['sometimes', Rule::in(Report::v2Labels())],
            'barangay' => ['sometimes', 'string', 'max:120'],
            'date_from' => ['sometimes', 'date_format:Y-m-d'],
            'date_to' => [
                'sometimes',
                'date_format:Y-m-d',
                'after_or_equal:date_from',
            ],
            'case_state' => ['sometimes', Rule::in(Report::caseStates())],
            'verification_outcome' => [
                'sometimes',
                Rule::in(Report::verificationOutcomes()),
            ],
            'field_validation_state' => [
                'sometimes',
                Rule::in(Report::fieldValidationStates()),
            ],
            'authority_classified_condition' => [
                'sometimes',
                Rule::in(Report::authorityClassifiedConditions()),
            ],
            'concern' => [
                'sometimes',
                Rule::in(['rssi', Report::REPORTER_CONCERN_RSSI]),
            ],
            'follow_up_outcome' => [
                'sometimes',
                Rule::in(['improved', 'unchanged', 'worsened', 'unable_to_determine']),
            ],
            'referral' => [
                'sometimes',
                Rule::in(['active']),
            ],
        ];

        if ($includeStatus) {
            $rules['status'] = ['sometimes', Rule::in(Report::reviewStatuses())];
        }

        if ($includeQueue) {
            $rules['queue'] = ['sometimes', Rule::in(Report::operationalQueues())];
        }

        return $rules;
    }
}
