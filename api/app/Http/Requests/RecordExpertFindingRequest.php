<?php

namespace App\Http\Requests;

use App\Models\Report;
use App\Models\ReportReferral;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\Rule;

class RecordExpertFindingRequest extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        $aliases = [
            'finding' => 'condition_opinion',
            'basis' => 'basis',
            'finding_details' => 'basis',
            'recommendation' => 'recommendation',
            'finding_recommendation' => 'recommendation',
            'finding_confidence' => 'confidence',
            'status' => 'consult_status',
            'expert_response_date' => 'response_date',
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
        foreach (['reference', 'condition_opinion', 'basis', 'recommendation'] as $field) {
            if ($this->has($field) && is_string($this->input($field))) {
                $value = trim($this->input($field));
                $trimmed[$field] = $field === 'reference' && $value === '' ? null : $value;
            }
        }

        if ($trimmed !== []) {
            $this->merge($trimmed);
        }

        $symptoms = $this->input('symptom_verdicts');
        if (is_array($symptoms) && array_is_list($symptoms)) {
            $normalizedSymptoms = [];
            foreach ($symptoms as $finding) {
                if (is_array($finding) && filled($finding['symptom_key'] ?? null)) {
                    $normalizedSymptoms[(string) $finding['symptom_key']] = [
                        'verdict' => $finding['verdict'] ?? null,
                        'note' => $finding['note'] ?? null,
                    ];
                }
            }
            $this->merge(['symptom_verdicts' => $normalizedSymptoms]);
        }
    }

    public function authorize(): bool
    {
        $report = $this->route('report');

        return $report instanceof Report
            && ($this->user()?->can('respondToReferral', $report) ?? false);
    }

    public function rules(): array
    {
        return [
            'reference' => ['sometimes', 'nullable', 'string', 'max:160'],
            'condition_opinion' => [
                'sometimes',
                'nullable',
                'string',
                'max:40',
                Rule::in(Report::activeAuthorityClassifiedConditions()),
            ],
            'symptom_verdicts' => ['sometimes', 'nullable', 'array'],
            'basis' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'confidence' => ['sometimes', 'nullable', Rule::in(['low', 'medium', 'high'])],
            'recommendation' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'consult_status' => [
                'sometimes',
                Rule::in([
                    ReportReferral::STATUS_IN_PROGRESS,
                    ReportReferral::STATUS_COMPLETED,
                    ReportReferral::STATUS_CANCELLED,
                ]),
            ],
            'response_date' => ['sometimes', 'nullable', 'date'],
            'expected_version' => ['required', 'integer', 'min:0'],
            // Expert findings are proposals only. Disposition fields belong to
            // the office review and confirmation paths, never this endpoint.
            'verification_outcome' => ['prohibited'],
            'authority_classified_condition' => ['prohibited'],
            'case_state' => ['prohibited'],
            'action_taken' => ['prohibited'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $symptoms = $this->input('symptom_verdicts');
            if (is_array($symptoms)) {
                foreach ($symptoms as $key => $finding) {
                    $verdict = is_array($finding)
                        ? ($finding['verdict'] ?? null)
                        : $finding;
                    if (! is_string($verdict) || ! in_array($verdict, ['present', 'absent', 'unsure'], true)) {
                        $validator->errors()->add(
                            "symptom_verdicts.{$key}",
                            'Each symptom verdict must be present, absent, or unsure.',
                        );
                    }
                }
            }

            $status = $this->input('consult_status', ReportReferral::STATUS_COMPLETED);
            if ($status !== ReportReferral::STATUS_CANCELLED && blank($this->input('response_date'))) {
                $validator->errors()->add(
                    'response_date',
                    'A response date is required while recording a consult finding.',
                );
            }

            $hasFinding = filled($this->input('condition_opinion'))
                || filled($this->input('basis'))
                || filled($this->input('recommendation'))
                || (is_array($symptoms) && $symptoms !== []);
            if ($status === ReportReferral::STATUS_COMPLETED && ! $hasFinding) {
                $validator->errors()->add(
                    'condition_opinion',
                    'Record at least one expert finding before completing the consult.',
                );
            }
        });
    }
}
