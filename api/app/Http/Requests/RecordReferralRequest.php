<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Validation\Rule;

class RecordReferralRequest extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        $aliases = [
            'referral_destination' => 'destination',
            'referral_reference' => 'reference',
            'referral_note' => 'note',
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
        foreach (['destination', 'reference', 'note', 'office_notes'] as $field) {
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
            'destination' => ['required', 'string', 'max:160', 'not_regex:/^\\s*$/'],
            'reference' => ['required', 'string', 'max:160', 'not_regex:/^\\s*$/'],
            'referral_date' => ['required', 'date'],
            'note' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'office_notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
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
}
