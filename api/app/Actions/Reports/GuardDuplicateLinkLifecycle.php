<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\ReportReferral;
use Illuminate\Validation\ValidationException;

final class GuardDuplicateLinkLifecycle
{
    public function handle(Report $report): void
    {
        $lifecycle = $report->lifecycleSnapshot();

        if ($lifecycle['case_state'] !== Report::CASE_STATE_OPEN) {
            throw ValidationException::withMessages([
                'case_state' => 'Duplicate links can only be changed while a case is open.',
            ]);
        }

        if ($report->referrals()
            ->whereIn('consult_status', ReportReferral::activeStatuses())
            ->exists()
        ) {
            throw ValidationException::withMessages([
                'referral' => 'Duplicate links cannot be changed while an expert consult is active.',
            ]);
        }

        if ($lifecycle['field_validation_state'] === Report::FIELD_VALIDATION_STATE_COMPLETED) {
            throw ValidationException::withMessages([
                'field_validation_state' => 'Duplicate links cannot be changed after field evidence is completed.',
            ]);
        }
    }
}
