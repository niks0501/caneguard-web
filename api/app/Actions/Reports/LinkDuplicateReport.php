<?php

namespace App\Actions\Reports;

use App\Actions\Notifications\CreateLifecycleNotifications;
use App\Models\Report;
use App\Models\ReportAudit;
use App\Models\User;
use App\Security\DistrictAccess;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LinkDuplicateReport
{
    public function __construct(
        private readonly GuardDuplicateLinkLifecycle $guardLifecycle,
        private readonly RecordReportReviewEvent $recordReviewEvent,
        private readonly CreateLifecycleNotifications $notifications,
    ) {}

    public function handle(
        User $actor,
        Report $duplicate,
        string $canonicalReportUuid,
        int $expectedVersion,
        ?string $reason = null,
        bool $closeDuplicate = false,
    ): Report {
        return DB::transaction(function () use (
            $actor,
            $duplicate,
            $canonicalReportUuid,
            $expectedVersion,
            $reason,
            $closeDuplicate,
        ): Report {
            $lockedDuplicate = Report::query()
                ->lockForUpdate()
                ->findOrFail($duplicate->getKey());
            $canonical = Report::query()->visibleTo($actor)
                ->lockForUpdate()
                ->where('uuid', $canonicalReportUuid)
                ->firstOrFail();

            abort_unless(
                (int) $lockedDuplicate->lock_version === $expectedVersion,
                409,
            );

            abort_unless(app(DistrictAccess::class)->report($actor, $lockedDuplicate), 403);
            $this->guardLifecycle->handle($lockedDuplicate);

            if ($lockedDuplicate->is($canonical)) {
                throw ValidationException::withMessages([
                    'canonical_report_uuid' => 'A case cannot be linked to itself.',
                ]);
            }

            if ($lockedDuplicate->canonical_report_id !== null) {
                if ((int) $lockedDuplicate->canonical_report_id !== (int) $canonical->getKey()) {
                    abort(409);
                }

                // Already linked to this case: stay idempotent, but still
                // honour an explicit request to close it.
                if ($closeDuplicate) {
                    $this->assertCanClose($actor, $lockedDuplicate);
                    $this->close($actor, $lockedDuplicate, $reason, now()->utc(), []);
                }

                return $lockedDuplicate->refresh();
            }

            if ($lockedDuplicate->duplicateReports()->exists()) {
                throw ValidationException::withMessages([
                    'report' => 'A case with linked duplicates cannot be linked as a duplicate.',
                ]);
            }

            if ($canonical->canonical_report_id !== null) {
                throw ValidationException::withMessages([
                    'canonical_report_uuid' => 'Choose a canonical case that is not already linked as a duplicate.',
                ]);
            }

            if ($closeDuplicate) {
                $this->assertCanClose($actor, $lockedDuplicate);
            }

            $timestamp = now()->utc();
            $linkUpdate = ['canonical_report_id' => $canonical->getKey()];
            if (! $closeDuplicate) {
                $lockedDuplicate->update($linkUpdate + [
                    'lock_version' => ((int) $lockedDuplicate->lock_version) + 1,
                ]);
            }

            ReportAudit::query()->create([
                'report_id' => $lockedDuplicate->getKey(),
                'actor_id' => $actor->getKey(),
                'field' => Report::AUDIT_FIELD_CANONICAL_REPORT,
                'original_value' => null,
                'corrected_value' => $canonical->uuid,
                'reason' => trim((string) $reason) !== ''
                    ? trim((string) $reason)
                    : 'Possible duplicate linkage recorded after authorized review.',
                'created_at' => $timestamp,
            ]);

            if ($closeDuplicate) {
                // One save, one version bump: the link and the closure land
                // together or not at all.
                $this->close($actor, $lockedDuplicate, $reason, $timestamp, $linkUpdate);
            }

            return $lockedDuplicate->refresh();
        }, attempts: 3);
    }

    /**
     * Closing is a review action, so it honours the same review lease the
     * review endpoint does.
     */
    private function assertCanClose(User $actor, Report $duplicate): void
    {
        abort_if(
            $duplicate->reviewClaimedByAnother($actor),
            423,
            'This case is being reviewed by another reviewer.',
        );
    }

    /**
     * Mirrors the closure writes of the review endpoint (ReviewReportController)
     * for a case-state-only change: lifecycle, legacy review status, reviewer
     * stamps, handoff reset, review event and the final-review notification.
     *
     * @param  array<string, mixed>  $extra  Columns to persist in the same update.
     */
    private function close(
        User $actor,
        Report $duplicate,
        ?string $reason,
        CarbonInterface $timestamp,
        array $extra,
    ): void {
        $lifecycle = $duplicate->lifecycleSnapshot();
        $lifecycle['case_state'] = Report::CASE_STATE_CLOSED;
        $note = trim((string) $reason) !== ''
            ? trim((string) $reason)
            : 'Closed as a duplicate after authorized review.';

        $duplicate->update($extra + [
            'case_state' => Report::CASE_STATE_CLOSED,
            'review_status' => Report::legacyReviewStatusForLifecycle($lifecycle),
            'reviewer_id' => $actor->getKey(),
            'reviewed_at' => $timestamp,
            'first_reviewed_at' => $duplicate->first_reviewed_at ?? $timestamp,
            'lock_version' => ((int) $duplicate->lock_version) + 1,
            'review_handoff_note' => null,
            'review_handoff_by_id' => null,
            'review_handoff_at' => null,
        ]);

        $this->recordReviewEvent->handle($duplicate, [
            'actor_id' => $actor->getKey(),
            'action_taken' => $duplicate->action_taken,
            'authority_classified_condition' => $duplicate->authority_classified_condition,
            'verification_outcome' => $duplicate->verification_outcome,
            'notes' => $note,
            'case_state' => Report::CASE_STATE_CLOSED,
            'created_at' => $timestamp,
        ]);

        $this->notifications->officeReviewCompleted($duplicate);
    }
}
