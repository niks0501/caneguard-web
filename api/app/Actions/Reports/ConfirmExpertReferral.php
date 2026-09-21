<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ConfirmExpertReferral
{
    /**
     * Record the office's explicit decision about the latest completed consult.
     * This action never changes report disposition fields; the office review
     * save remains the only path that applies a classification.
     *
     * @param  array<string, mixed>  $data
     */
    public function handle(User $actor, Report $report, array $data): Report
    {
        return DB::transaction(function () use ($actor, $report, $data): Report {
            $locked = Report::query()
                ->lockForUpdate()
                ->findOrFail($report->getKey());

            abort_unless(
                $locked->lock_version === $data['expected_version'],
                409,
            );

            $consult = $locked->referrals()
                ->where('consult_status', ReportReferral::STATUS_COMPLETED)
                ->latest('id')
                ->lockForUpdate()
                ->first();
            if (! $consult) {
                throw ValidationException::withMessages([
                    'referral' => 'A completed expert consult is required before it can be confirmed.',
                ]);
            }

            $hasFinding = filled($consult->condition_opinion)
                || filled($consult->finding_summary)
                || filled($consult->finding_details)
                || filled($consult->finding_recommendation)
                || (is_array($consult->symptom_verdicts) && $consult->symptom_verdicts !== []);
            if (! $hasFinding) {
                throw ValidationException::withMessages([
                    'referral' => 'An expert finding is required before the consult can be confirmed.',
                ]);
            }

            $outcome = $data['consult_review_outcome'];
            if ($consult->consult_review_outcome === $outcome) {
                return $locked;
            }

            $reviewedAt = now()->utc();
            $consult->update([
                'consult_review_outcome' => $outcome,
                'consult_review_note' => $data['consult_review_note'] ?? null,
                'consult_reviewed_by_id' => $actor->getKey(),
                'consult_reviewed_at' => $reviewedAt,
            ]);
            $locked->update([
                'lock_version' => $locked->lock_version + 1,
            ]);

            return $locked;
        }, attempts: 3);
    }
}
