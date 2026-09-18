<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RecordReportReferral
{
    /**
     * Record the handoff as an operational action while preserving the
     * independent verification and case-state dimensions.
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

            $lifecycle = $locked->lifecycleSnapshot();
            if ($lifecycle['case_state'] !== Report::CASE_STATE_OPEN) {
                throw ValidationException::withMessages([
                    'referral' => 'Only open cases can be referred for expert validation.',
                ]);
            }

            $activeConsult = $locked->referrals()
                ->whereIn('consult_status', ReportReferral::activeStatuses())
                ->lockForUpdate()
                ->first();
            if ($activeConsult !== null) {
                throw ValidationException::withMessages([
                    'referral' => 'This case already has an active expert consult.',
                ]);
            }

            $requestedStatus = $data['consult_status'] ?? ReportReferral::STATUS_PENDING;
            if (! in_array($requestedStatus, [
                ReportReferral::STATUS_PENDING,
                ReportReferral::STATUS_IN_PROGRESS,
            ], true)) {
                throw ValidationException::withMessages([
                    'status' => 'A new expert consult must be pending or in progress.',
                ]);
            }

            $reviewedAt = now()->utc();
            $authorityFinding = array_key_exists('authority_classified_condition', $data)
                ? $data['authority_classified_condition']
                : $locked->authority_classified_condition;
            $verificationOutcome = array_key_exists('verification_outcome', $data)
                ? $data['verification_outcome']
                : $lifecycle['verification_outcome'];
            $reviewNotes = array_key_exists('office_notes', $data)
                ? $data['office_notes']
                : $locked->review_notes;
            $nextLifecycle = [
                ...$lifecycle,
                'verification_outcome' => $verificationOutcome,
                'referral_state' => Report::REFERRAL_STATE_REFERRED,
            ];

            $locked->update([
                'review_status' => Report::legacyReviewStatusForLifecycle($nextLifecycle),
                'verification_outcome' => $verificationOutcome,
                'referral_state' => Report::REFERRAL_STATE_REFERRED,
                'action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
                'authority_classified_condition' => $authorityFinding,
                'review_notes' => $reviewNotes,
                'reviewer_id' => $actor->getKey(),
                'reviewed_at' => $reviewedAt,
                'lock_version' => $locked->lock_version + 1,
            ]);

            $locked->referrals()->create([
                'referred_by_id' => $actor->getKey(),
                'destination' => $data['destination'],
                'reference' => $data['reference'],
                'referral_date' => $data['referral_date'],
                'due_date' => $data['due_date'] ?? null,
                'expert_name' => $data['expert_name'] ?? null,
                'expert_contact' => $data['expert_contact'] ?? null,
                'note' => $data['note'] ?? null,
                'consult_status' => $requestedStatus,
                'office_case_state' => $lifecycle['case_state'],
                'office_verification_outcome' => $verificationOutcome,
                'office_field_validation_state' => $lifecycle['field_validation_state'],
                'office_action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
                'office_authority_classified_condition' => $authorityFinding,
                'office_review_notes' => $reviewNotes,
                'office_reviewer_id' => $actor->getKey(),
                'office_reviewed_at' => $reviewedAt,
            ]);

            return $locked;
        }, attempts: 3);
    }
}
