<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Short review lease so two reviewers do not work the same case at once.
 *
 * The lease is advisory UX plus a server-side guard on the review endpoint;
 * `lock_version` remains the correctness backstop. It never changes
 * `lock_version` and never touches `updated_at`, so a draft another reviewer
 * has already loaded stays valid.
 */
class ManageReviewClaim
{
    /** Heartbeats renew the lease; closing the tab lets it lapse. */
    public const TTL_SECONDS = 300;

    /**
     * Claim, or renew the caller's own claim. Another reviewer's active claim
     * is refused unless an admin forces a takeover.
     *
     * @return array{report: Report, held: bool}
     */
    public function claim(Report $report, User $actor, bool $takeover = false): array
    {
        return DB::transaction(function () use ($report, $actor, $takeover): array {
            $locked = Report::query()->lockForUpdate()->findOrFail($report->getKey());

            if ($locked->reviewClaimedByAnother($actor)) {
                if (! $takeover || $actor->role !== User::ROLE_ADMIN) {
                    return ['report' => $locked, 'held' => false];
                }

                Log::info('Review claim taken over.', [
                    'report_uuid' => $locked->uuid,
                    'previous_claimant_id' => $locked->review_claimed_by_id,
                    'actor_id' => $actor->getKey(),
                ]);
            }

            $now = now()->utc();
            $mine = (int) $locked->review_claimed_by_id === (int) $actor->getKey();
            $locked->forceFill([
                'review_claimed_by_id' => $actor->getKey(),
                'review_claimed_at' => $mine && $locked->review_claimed_at && $locked->review_claim_expires_at?->isFuture()
                    ? $locked->review_claimed_at
                    : $now,
                'review_claim_expires_at' => $now->copy()->addSeconds(self::TTL_SECONDS),
            ])->saveQuietly();

            return ['report' => $locked, 'held' => true];
        });
    }

    /** Release only the caller's own claim; releasing someone else's is a no-op. */
    public function release(Report $report, User $actor): Report
    {
        return DB::transaction(function () use ($report, $actor): Report {
            $locked = Report::query()->lockForUpdate()->findOrFail($report->getKey());

            if ((int) $locked->review_claimed_by_id === (int) $actor->getKey()) {
                $locked->forceFill([
                    'review_claimed_by_id' => null,
                    'review_claimed_at' => null,
                    'review_claim_expires_at' => null,
                ])->saveQuietly();
            }

            return $locked;
        });
    }
}
