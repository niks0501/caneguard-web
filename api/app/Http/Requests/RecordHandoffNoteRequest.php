<?php

namespace App\Http\Requests;

use App\Models\Report;

class RecordHandoffNoteRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        $report = $this->route('report');

        return $report instanceof Report && ($this->user()?->can('review', $report) ?? false);
    }

    public function rules(): array
    {
        return [
            'destination' => ['required', 'string', 'max:160', 'not_regex:/^\s*$/'],
            'reference' => ['sometimes', 'nullable', 'string', 'max:160'],
            'sent_date' => ['required', 'date_format:Y-m-d'],
            'note' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'advice_received_note' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'expected_version' => ['required', 'integer', 'min:0'],
            'consult_status' => ['prohibited'],
            'due_date' => ['prohibited'],
            'expert_uuid' => ['prohibited'],
            'referral_state' => ['prohibited'],
            'action_taken' => ['prohibited'],
        ];
    }
}
