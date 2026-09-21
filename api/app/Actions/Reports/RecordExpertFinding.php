<?php

namespace App\Actions\Reports;

use App\Actions\Notifications\CreateLifecycleNotifications;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RecordExpertFinding
{
    public function __construct(
        private readonly CreateLifecycleNotifications $notifications,
        private readonly RecordReportReviewEvent $reviewEvents,
    ) {}

    /**
     * Store an in-system expert's finding as consult evidence only. The report
     * classification and other disposition fields remain office-owned.
     *
     * @param  array<string, mixed>  $data
     */
    public function handle(User $actor, Report $report, array $data): Report
    {
        $updated = DB::transaction(function () use ($actor, $report, $data): Report {
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
                    'response_date' => 'Expert findings must be recorded before a case is closed.',
                ]);
            }

            $referral = $locked->referrals()
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
            $recordedAt = now()->utc();
            $conditionOpinion = $data['condition_opinion'] ?? null;
            $basis = $data['basis'] ?? null;
            $recommendation = $data['recommendation'] ?? null;
            $symptomVerdicts = $data['symptom_verdicts'] ?? null;
            $hasFinding = filled($conditionOpinion)
                || filled($basis)
                || filled($recommendation)
                || (is_array($symptomVerdicts) && $symptomVerdicts !== []);

            if ($consultCompleted && ! $hasFinding) {
                throw ValidationException::withMessages([
                    'condition_opinion' => 'Record at least one expert finding before completing the consult.',
                ]);
            }

            $nextReferralState = $consultCompleted
                ? Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED
                : ($consultCancelled
                    ? Report::REFERRAL_STATE_NOT_REFERRED
                    : Report::REFERRAL_STATE_REFERRED);
            $nextLifecycle = [
                ...$lifecycle,
                'referral_state' => $nextReferralState,
            ];

            $locked->update([
                'review_status' => Report::legacyReviewStatusForLifecycle($nextLifecycle),
                'referral_state' => $nextReferralState,
                'lock_version' => $locked->lock_version + 1,
            ]);

            $referral->update([
                'consult_status' => $consultStatus,
                'response_date' => $consultCancelled ? null : ($data['response_date'] ?? null),
                'response_note' => $consultCancelled ? null : $basis,
                'response_finding' => $consultCancelled ? null : $conditionOpinion,
                'response_recorded_by_id' => $consultCancelled ? null : $actor->getKey(),
                'response_recorded_at' => $consultCancelled ? null : $recordedAt,
                'condition_opinion' => $consultCancelled ? null : $conditionOpinion,
                'symptom_verdicts' => $consultCancelled ? null : $symptomVerdicts,
                'finding_summary' => $consultCancelled ? null : $conditionOpinion,
                'finding_details' => $consultCancelled ? null : $basis,
                'finding_confidence' => $consultCancelled ? null : ($data['confidence'] ?? null),
                'finding_recommendation' => $consultCancelled ? null : $recommendation,
                'finding_source' => $consultCancelled ? null : ReportReferral::FINDING_SOURCE_IN_SYSTEM,
                'finding_recorded_by_id' => $consultCancelled || ! $hasFinding
                    ? null
                    : $actor->getKey(),
                'finding_recorded_at' => $consultCancelled || ! $hasFinding
                    ? null
                    : $recordedAt,
            ]);

            $this->reviewEvents->handle($locked, [
                'actor_id' => $actor->getKey(),
                'action_taken' => $locked->action_taken,
                'authority_classified_condition' => $locked->authority_classified_condition,
                'verification_outcome' => $locked->verification_outcome,
                'notes' => $consultCancelled ? 'Expert consult cancelled' : ($basis ?? $locked->review_notes),
                'case_state' => $lifecycle['case_state'],
                'created_at' => $recordedAt,
            ]);

            return $locked;
        }, attempts: 3);

        $updated->load(['referral.expert']);
        if ($updated->referral?->consult_status === ReportReferral::STATUS_COMPLETED) {
            $this->notifications->expertReferralResponseReceived($updated);
        }

        return $updated;
    }
}
