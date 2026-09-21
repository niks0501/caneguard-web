<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\ReportAudit;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LinkDuplicateReport
{
    public function __construct(
        private readonly GuardDuplicateLinkLifecycle $guardLifecycle,
    ) {}

    public function handle(
        User $actor,
        Report $duplicate,
        string $canonicalReportUuid,
        int $expectedVersion,
        ?string $reason = null,
    ): Report {
        return DB::transaction(function () use (
            $actor,
            $duplicate,
            $canonicalReportUuid,
            $expectedVersion,
            $reason,
        ): Report {
            $lockedDuplicate = Report::query()
                ->lockForUpdate()
                ->findOrFail($duplicate->getKey());
            $canonical = Report::query()
                ->lockForUpdate()
                ->where('uuid', $canonicalReportUuid)
                ->firstOrFail();

            abort_unless(
                (int) $lockedDuplicate->lock_version === $expectedVersion,
                409,
            );

            $this->guardLifecycle->handle($lockedDuplicate);

            if ($lockedDuplicate->is($canonical)) {
                throw ValidationException::withMessages([
                    'canonical_report_uuid' => 'A case cannot be linked to itself.',
                ]);
            }

            if ($lockedDuplicate->canonical_report_id !== null) {
                if ((int) $lockedDuplicate->canonical_report_id === (int) $canonical->getKey()) {
                    return $lockedDuplicate->refresh();
                }

                abort(409);
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

            $timestamp = now()->utc();
            $lockedDuplicate->update([
                'canonical_report_id' => $canonical->getKey(),
                'lock_version' => ((int) $lockedDuplicate->lock_version) + 1,
            ]);

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

            return $lockedDuplicate->refresh();
        }, attempts: 3);
    }
}
