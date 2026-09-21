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
        $recordedReferralId = null;
        $updated = DB::transaction(function () use ($actor, $report, $data, &$recordedReferralId): Report {
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

            // The request policy authorizes the route before this transaction
            // acquires the report lock. Re-check the locked consult owner so a
            // consult completed and reassigned between those steps cannot
            // receive a finding from the previous expert.
            if ($actor->isExpert() && (int) $referral->expert_id !== (int) $actor->getKey()) {
                abort(403);
            }

            $consultStatus = $data['consult_status'] ?? ReportReferral::STATUS_COMPLETED;
            $consultCompleted = $consultStatus === ReportReferral::STATUS_COMPLETED;
            $consultCancelled = $consultStatus === ReportReferral::STATUS_CANCELLED;
            $recordedAt = now()->utc();
            $conditionOpinion = $data['condition_opinion'] ?? null;
            $basis = $data['basis'] ?? null;
            $recommendation = $data['recommendation'] ?? null;
            $symptomVerdicts = $data['symptom_verdicts'] ?? null;
            $validSymptomKeys = $locked->symptoms()->pluck('symptom_key')->map(
                static fn ($key): string => (string) $key,
            )->all();
            $normalizedSymptomVerdicts = is_array($symptomVerdicts)
                ? collect($symptomVerdicts)
                    ->filter(fn ($finding, $key): bool => in_array((string) $key, $validSymptomKeys, true))
                    ->map(fn ($finding): array => [
                        'verdict' => is_array($finding) ? ($finding['verdict'] ?? null) : $finding,
                        'note' => is_array($finding) ? ($finding['note'] ?? null) : null,
                    ])
                    ->all()
                : null;
            $hasFinding = filled($conditionOpinion)
                || filled($basis)
                || filled($recommendation)
                || (is_array($normalizedSymptomVerdicts) && $normalizedSymptomVerdicts !== []);

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
                'symptom_verdicts' => $consultCancelled ? null : $normalizedSymptomVerdicts,
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
            $recordedReferralId = $referral->getKey();

            if ($consultCancelled) {
                $referral->symptomFindings()->delete();
            } elseif (is_array($normalizedSymptomVerdicts)) {
                $referral->symptomFindings()->delete();
                foreach ($normalizedSymptomVerdicts as $symptomKey => $finding) {
                    if (! in_array($finding['verdict'], ['present', 'absent', 'unsure'], true)) {
                        continue;
                    }
                    $referral->symptomFindings()->create([
                        'symptom_key' => (string) $symptomKey,
                        'verdict' => $finding['verdict'],
                        'note' => $finding['note'],
                    ]);
                }
            }

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

        $recordedReferral = ReportReferral::query()->findOrFail($recordedReferralId);
        if ($recordedReferral->consult_status === ReportReferral::STATUS_COMPLETED) {
            $this->notifications->expertReferralResponseReceived($updated, $recordedReferral);
        }

        return $updated;
    }
}
