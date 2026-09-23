<?php

namespace App\Http\Requests;

use App\Models\Report;
use App\Models\ReportReferral;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\Rule;

class RecordExpertReferralResponseRequest extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        $aliases = [
            'expert_response_date' => 'response_date',
            'expert_response_note' => 'response_note',
            'expert_response_finding' => 'response_finding',
            'finding_summary' => 'response_note',
            'finding_details' => 'response_finding',
            'finding' => 'response_finding',
            'recommendation' => 'finding_recommendation',
            'source' => 'finding_source',
            'status' => 'consult_status',
        ];
        $normalized = [];

        foreach ($aliases as $alias => $canonical) {
            if (! $this->has($canonical) && $this->has($alias)) {
                $normalized[$canonical] = $this->input($alias);
            }
        }

        if ($normalized !== []) {
            $this->merge($normalized);
        }

        $trimmed = [];
        foreach (['reference', 'response_note', 'response_finding', 'finding_recommendation', 'finding_source'] as $field) {
            if ($this->has($field) && is_string($this->input($field))) {
                $value = trim($this->input($field));
                $trimmed[$field] = $field === 'reference' && $value === '' ? null : $value;
            }
        }

        if ($trimmed !== []) {
            $this->merge($trimmed);
        }
    }

    public function authorize(): bool
    {
        $report = $this->route('report');

        return $report instanceof Report
            && ($this->user()?->can('review', $report) ?? false);
    }

    public function rules(): array
    {
        return [
            'response_date' => ['sometimes', 'date'],
            'reference' => ['sometimes', 'nullable', 'string', 'max:160'],
            'consult_status' => [
                'sometimes',
                Rule::in([
                    ReportReferral::STATUS_IN_PROGRESS,
                    ReportReferral::STATUS_COMPLETED,
                    ReportReferral::STATUS_CANCELLED,
                ]),
            ],
            'response_note' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'response_finding' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'finding_recommendation' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'finding_source' => [
                'sometimes',
                'nullable',
                Rule::in(ReportReferral::findingSources()),
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
            'expected_version' => ['required', 'integer', 'min:0'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $report = $this->route('report');
            if (
                $report instanceof Report
                && array_key_exists('authority_classified_condition', $this->all())
                && ! $report->canUpdateAuthorityClassifiedCondition(
                    $this->input('authority_classified_condition'),
                )
            ) {
                $validator->errors()->add(
                    'authority_classified_condition',
                    'Legacy Downy mildew can only be preserved on an existing historical classification.',
                );
            }

            $hasNote = filled($this->input('response_note'));
            $hasFinding = filled($this->input('response_finding'))
                || filled($this->input('finding_recommendation'));
            $status = $this->input('consult_status', ReportReferral::STATUS_COMPLETED);

            if ($status !== ReportReferral::STATUS_CANCELLED && blank($this->input('response_date'))) {
                $validator->errors()->add(
                    'response_date',
                    'A response date is required while recording a consult update.',
                );
            }

            if ($status === ReportReferral::STATUS_COMPLETED && ! $hasNote && ! $hasFinding) {
                $validator->errors()->add(
                    'response_note',
                    'Record an expert response note or finding.',
                );
            }
        });
    }
}
