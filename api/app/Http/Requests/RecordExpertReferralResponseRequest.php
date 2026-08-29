<?php

namespace App\Http\Requests;

use App\Models\Report;
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
        foreach (['response_note', 'response_finding'] as $field) {
            if ($this->has($field) && is_string($this->input($field))) {
                $trimmed[$field] = trim($this->input($field));
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
            'response_date' => ['required', 'date'],
            'response_note' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'response_finding' => ['sometimes', 'nullable', 'string', 'max:2000'],
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
            $hasNote = filled($this->input('response_note'));
            $hasFinding = filled($this->input('response_finding'));

            if (! $hasNote && ! $hasFinding) {
                $validator->errors()->add(
                    'response_note',
                    'Record an expert response note or finding.',
                );
            }
        });
    }
}
