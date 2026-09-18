<?php

namespace App\Http\Requests;

use App\Models\Report;
use App\Models\ReportReferral;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\Rule;

class RecordReferralRequest extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        $aliases = [
            'referral_destination' => 'destination',
            'referral_reference' => 'reference',
            'referral_note' => 'note',
            'status' => 'consult_status',
            'consult_due_date' => 'due_date',
            'due_on' => 'due_date',
            'expert_contact_name' => 'expert_name',
            'contact' => 'expert_contact',
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
        foreach (['destination', 'reference', 'expert_name', 'expert_contact', 'note', 'office_notes'] as $field) {
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
            'due_date' => ['sometimes', 'nullable', 'date'],
            'consult_status' => [
                'sometimes',
                Rule::in(ReportReferral::statuses()),
            ],
            'expert_name' => ['sometimes', 'nullable', 'string', 'max:160'],
            'expert_contact' => ['sometimes', 'nullable', 'string', 'max:320'],
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
        });
    }
}
