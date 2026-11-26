<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Illuminate\Validation\ValidationException;

final class GuardDuplicateLinkLifecycle
{
    public const REASON_CLOSED = 'closed';

    public const REASON_VISIT_COMPLETED = 'visit_completed';

    /**
     * Why the duplicate linkage of a case cannot currently change, or null
     * when it can. The single source for both the 422 below and the
     * `duplicate_linkage.link_blocked_reason` signal clients read upfront.
     */
    public function blockedReason(Report $report): ?string
    {
        $lifecycle = $report->lifecycleSnapshot();

        if ($lifecycle['case_state'] !== Report::CASE_STATE_OPEN) {
            return self::REASON_CLOSED;
        }

        if ($lifecycle['field_validation_state'] === Report::FIELD_VALIDATION_STATE_COMPLETED) {
            return self::REASON_VISIT_COMPLETED;
        }

        return null;
    }

    public function handle(Report $report): void
    {
        match ($this->blockedReason($report)) {
            self::REASON_CLOSED => throw ValidationException::withMessages([
                'case_state' => 'Duplicate links can only be changed while a case is open.',
            ]),
            self::REASON_VISIT_COMPLETED => throw ValidationException::withMessages([
                'field_validation_state' => 'Duplicate links cannot be changed after field evidence is completed.',
            ]),
            default => null,
        };
    }
}
