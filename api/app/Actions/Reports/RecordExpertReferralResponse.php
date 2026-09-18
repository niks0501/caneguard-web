<?php

namespace App\Actions\Reports;

use App\Actions\Notifications\CreateLifecycleNotifications;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RecordExpertReferralResponse
{
    public function __construct(
        private readonly CreateLifecycleNotifications $notifications,
        private readonly RecordReportReviewEvent $reviewEvents,
    ) {}

    /**
     * Record one expert response and return the still-open case.
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
                    'response_date' => 'Expert responses must be recorded before a case is closed.',
                ]);
            }

            $referral = ReportReferral::query()
                ->where('report_id', $locked->getKey())
                ->whereIn('consult_status', ReportReferral::activeStatuses())
                ->latest('id')
                ->lockForUpdate()
                ->first();

            if (! $referral) {
                throw ValidationException::withMessages([
                    'referral' => 'An active expert consult is required before recording a finding.',
                ]);
            }

            $consultStatus = $data['consult_status'] ?? ReportReferral::STATUS_COMPLETED;
            $consultCompleted = $consultStatus === ReportReferral::STATUS_COMPLETED;
            $consultCancelled = $consultStatus === ReportReferral::STATUS_CANCELLED;
            $reviewedAt = now()->utc();
            $authorityFinding = array_key_exists('authority_classified_condition', $data)
                ? $data['authority_classified_condition']
                : $locked->authority_classified_condition;
            $verificationOutcome = array_key_exists('verification_outcome', $data)
                ? $data['verification_outcome']
                : $lifecycle['verification_outcome'];
            $nextLifecycle = [
                ...$lifecycle,
                'verification_outcome' => $verificationOutcome,
                'referral_state' => $consultCompleted
                    ? Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED
                    : ($consultCancelled
                        ? Report::REFERRAL_STATE_NOT_REFERRED
                        : Report::REFERRAL_STATE_REFERRED),
            ];

            $locked->update([
                'review_status' => Report::legacyReviewStatusForLifecycle($nextLifecycle),
                'verification_outcome' => $verificationOutcome,
                'referral_state' => $nextLifecycle['referral_state'],
                'authority_classified_condition' => $authorityFinding,
                'reviewer_id' => $actor->getKey(),
                'reviewed_at' => $reviewedAt,
                'lock_version' => $locked->lock_version + 1,
            ]);

            $responseNote = $data['response_note'] ?? null;
            $responseFinding = $data['response_finding'] ?? null;
            $findingRecommendation = $data['finding_recommendation'] ?? null;
            $hasFinding = filled($responseNote)
                || filled($responseFinding)
                || filled($findingRecommendation);
            $findingSource = filled($data['finding_source'] ?? null)
                ? $data['finding_source']
                : ($hasFinding ? ReportReferral::FINDING_SOURCE_TRANSCRIBED : null);

            $referral->update([
                'consult_status' => $consultStatus,
                'response_date' => $data['response_date'] ?? null,
                'response_note' => $consultCancelled ? null : $responseNote,
                'response_finding' => $consultCancelled ? null : $responseFinding,
                'response_recorded_by_id' => $consultCancelled ? null : $actor->getKey(),
                'response_recorded_at' => $consultCancelled ? null : $reviewedAt,
                'finding_summary' => $consultCancelled ? null : $responseNote,
                'finding_details' => $consultCancelled ? null : $responseFinding,
                'finding_recommendation' => $consultCancelled ? null : $findingRecommendation,
                'finding_source' => $consultCancelled ? null : $findingSource,
                'finding_recorded_by_id' => $consultCancelled || ! $hasFinding ? null : $actor->getKey(),
                'finding_recorded_at' => $consultCancelled || ! $hasFinding ? null : $reviewedAt,
            ]);

            $this->reviewEvents->handle($locked, [
                'actor_id' => $actor->getKey(),
                'action_taken' => $locked->action_taken,
                'authority_classified_condition' => $authorityFinding,
                'verification_outcome' => $verificationOutcome,
                'notes' => $consultCancelled ? 'Expert consult cancelled' : ($responseNote ?? $locked->review_notes),
                'case_state' => $nextLifecycle['case_state'] ?? $lifecycle['case_state'],
                'created_at' => $reviewedAt,
            ]);

            if ($consultCompleted) {
                $this->notifications->expertReferralResponseReceived($locked);
            }

            return $locked;
        }, attempts: 3);
    }
}
