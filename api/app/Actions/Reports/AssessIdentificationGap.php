<?php

namespace App\Actions\Reports;

use App\Models\Report;

class AssessIdentificationGap
{
    /**
     * Derive the current identification signal from report evidence and office
     * fields. This is advice only; it never writes lifecycle state.
     *
     * @return array{state: 'identified'|'provisional'|'unidentified', reasons: array<int, string>}
     */
    public function handle(Report $report): array
    {
        if ($report->verification_outcome === Report::VERIFICATION_OUTCOME_VERIFIED) {
            return ['state' => 'identified', 'reasons' => []];
        }

        if (
            $report->case_state === Report::CASE_STATE_OPEN
            && (
                $report->authority_classified_condition === null
                || $report->authority_classified_condition === Report::AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY
            )
        ) {
            return [
                'state' => 'unidentified',
                'reasons' => [
                    $report->authority_classified_condition === Report::AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY
                        ? 'The office could not identify a condition.'
                        : 'No condition has been identified yet.',
                ],
            ];
        }

        $reasons = [];
        if (
            $report->authority_classified_condition !== null
            && $report->verification_outcome === Report::VERIFICATION_OUTCOME_NOT_DETERMINED
        ) {
            $reasons[] = 'A condition is recorded but verification is not complete.';
        }
        if ($report->mismatch_reported === true) {
            $reasons[] = 'The reporter flagged a mismatch with the possible condition.';
        }
        if (in_array($report->checklist_consistency, ['inconsistent', 'inconclusive'], true)) {
            $reasons[] = 'The symptom checklist is '.$report->checklist_consistency.'.';
        }

        return [
            'state' => $reasons === [] ? 'identified' : 'provisional',
            'reasons' => $reasons,
        ];
    }
}
