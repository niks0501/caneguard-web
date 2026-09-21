<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\Rule;

class ConfirmExpertReferralRequest extends ApiFormRequest
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
            'consult_review_outcome' => [
                'required',
                Rule::in(['accepted', 'overridden']),
            ],
            'consult_review_note' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'expected_version' => ['required', 'integer', 'min:0'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (
                $this->input('consult_review_outcome') === 'overridden'
                && blank($this->input('consult_review_note'))
            ) {
                $validator->errors()->add(
                    'consult_review_note',
                    'Explain why the office is overriding the expert proposal.',
                );
            }
        });
    }
}
