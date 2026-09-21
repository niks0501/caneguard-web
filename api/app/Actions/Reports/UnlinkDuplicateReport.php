<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\ReportAudit;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class UnlinkDuplicateReport
{
    public function __construct(
        private readonly GuardDuplicateLinkLifecycle $guardLifecycle,
    ) {}

    public function handle(
        User $actor,
        Report $duplicate,
        int $expectedVersion,
        ?string $reason = null,
    ): Report {
        return DB::transaction(function () use ($actor, $duplicate, $expectedVersion, $reason): Report {
            $lockedDuplicate = Report::query()
                ->lockForUpdate()
                ->findOrFail($duplicate->getKey());

            abort_unless(
                (int) $lockedDuplicate->lock_version === $expectedVersion,
                409,
            );

            $this->guardLifecycle->handle($lockedDuplicate);

            if ($lockedDuplicate->canonical_report_id === null) {
                throw ValidationException::withMessages([
                    'report' => 'This case is not linked as a duplicate.',
                ]);
            }

            $canonical = Report::query()
                ->lockForUpdate()
                ->findOrFail($lockedDuplicate->canonical_report_id);
            $timestamp = now()->utc();

            $lockedDuplicate->update([
                'canonical_report_id' => null,
                'lock_version' => ((int) $lockedDuplicate->lock_version) + 1,
            ]);

            ReportAudit::query()->create([
                'report_id' => $lockedDuplicate->getKey(),
                'actor_id' => $actor->getKey(),
                'field' => Report::AUDIT_FIELD_CANONICAL_REPORT,
                'original_value' => $canonical->uuid,
                'corrected_value' => null,
                'reason' => trim((string) $reason) !== ''
                    ? trim((string) $reason)
                    : 'Duplicate linkage removed after authorized review.',
                'created_at' => $timestamp,
            ]);

            return $lockedDuplicate->refresh();
        }, attempts: 3);
    }
}
