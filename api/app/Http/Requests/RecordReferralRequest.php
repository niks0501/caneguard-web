<?php

namespace App\Http\Requests;

use App\Models\Advisory;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
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
            'selected_advisory_uuid' => 'advisory_uuid',
        ];
        $normalized = [];
        if (! $this->has('advisory_uuid')
            && $this->has('advisory_id')
            && ! is_numeric($this->input('advisory_id'))
        ) {
            $normalized['advisory_uuid'] = $this->input('advisory_id');
        }

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
            'expert_uuid' => ['sometimes', 'nullable', 'uuid', Rule::exists('users', 'uuid')],
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
            'advisory_uuid' => [
                'sometimes',
                'nullable',
                'uuid',
                Rule::exists('advisories', 'uuid'),
            ],
            'advisory_id' => [
                'sometimes',
                'nullable',
                'integer',
                Rule::exists('advisories', 'id'),
            ],
            'expected_version' => ['required', 'integer', 'min:0'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (
                filled($this->input('expert_uuid'))
                && ! User::query()
                    ->where('uuid', $this->input('expert_uuid'))
                    ->where('role', User::ROLE_EXPERT)
                    ->exists()
            ) {
                $validator->errors()->add(
                    'expert_uuid',
                    'The selected expert must be an in-system expert.',
                );
            }

            $report = $this->route('report');
            if ((filled($this->input('advisory_uuid')) || filled($this->input('advisory_id')))
                && ! Advisory::query()
                    ->when(
                        filled($this->input('advisory_uuid')),
                        fn ($query) => $query->where('uuid', $this->input('advisory_uuid')),
                        fn ($query) => $query->whereKey($this->input('advisory_id')),
                    )
                    ->where('status', Advisory::STATUS_VALIDATED)
                    ->exists()
            ) {
                $validator->errors()->add(
                    'advisory_uuid',
                    'Only a validated advisory can be delivered to a field reporter.',
                );
            }

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
