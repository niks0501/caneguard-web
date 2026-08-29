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
                ->lockForUpdate()
                ->first();

            if (! $referral || $lifecycle['referral_state'] !== Report::REFERRAL_STATE_REFERRED) {
                throw ValidationException::withMessages([
                    'referral' => 'An active referral is required before recording an expert response.',
                ]);
            }

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
                'referral_state' => Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED,
            ];

            $locked->update([
                'review_status' => Report::legacyReviewStatusForLifecycle($nextLifecycle),
                'verification_outcome' => $verificationOutcome,
                'referral_state' => Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED,
                'authority_classified_condition' => $authorityFinding,
                'reviewer_id' => $actor->getKey(),
                'reviewed_at' => $reviewedAt,
                'lock_version' => $locked->lock_version + 1,
            ]);

            $referral->update([
                'response_date' => $data['response_date'],
                'response_note' => $data['response_note'] ?? null,
                'response_finding' => $data['response_finding'] ?? null,
                'response_recorded_by_id' => $actor->getKey(),
                'response_recorded_at' => $reviewedAt,
            ]);

            $this->notifications->expertReferralResponseReceived($locked);

            return $locked;
        }, attempts: 3);
    }
}
