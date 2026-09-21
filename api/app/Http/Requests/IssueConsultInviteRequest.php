<?php

namespace App\Http\Requests;

use App\Models\Report;

class IssueConsultInviteRequest extends ApiFormRequest
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
            'share_full_context' => ['sometimes', 'boolean'],
        ];
    }
}
