<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\MobileFieldValidationAssignmentRequest;
use App\Http\Resources\MobileFieldValidationAssignmentResource;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;

class MobileFieldValidationAssignmentController extends Controller
{
    /**
     * The most assignments one phone downloads. A larger work set is cut to
     * the highest-priority rows and reported through sync.total/truncated.
     */
    public const WORK_SET_CAP = 300;

    public function __invoke(
        MobileFieldValidationAssignmentRequest $request,
    ): AnonymousResourceCollection {
        $syncBefore = CarbonImmutable::parse(
            $request->validated('sync_before') ?? now(),
        )->utc();
        if ($request->validated('sync_before') === null) {
            // SQLite/MySQL bindings may truncate the millisecond timestamp
            // written during the assignment mutation. The one-second ceiling
            // keeps an immediately activated assignment in the first feed.
            $syncBefore = $syncBefore->addSecond();
        }
        $owned = FieldValidationAssignment::query()
            ->where('assignee_id', $request->user()->getKey())
            ->whereHas('report', function ($query) use ($request): void {
                $query->visibleTo($request->user(), false)
                    ->where('case_state', Report::CASE_STATE_OPEN)
                    ->whereIn('field_validation_state', [
                        Report::FIELD_VALIDATION_STATE_ASSIGNED,
                        Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
                        Report::FIELD_VALIDATION_STATE_COMPLETED,
                    ]);
            })
            ->where('updated_at', '<=', $syncBefore);

        [$selectedIds, $total] = $this->selectWorkSet($owned);
        $truncated = $total > count($selectedIds);
        $version = $this->workSetVersion($selectedIds, $total, $request->user()->getKey());

        // A phone that already holds this version needs no rows. A cursor
        // means it is mid-download, so the version shortcut never applies.
        $unchanged = $request->validated('cursor') === null
            && $request->validated('since') === $version;
        if ($unchanged) {
            $selectedIds = [];
        }

        $query = FieldValidationAssignment::query()
            ->whereIn('id', $selectedIds)
            ->when(
                $request->validated('updated_after'),
                fn ($query, string $updatedAfter) => $query->where(
                    'updated_at',
                    '>',
                    CarbonImmutable::parse($updatedAfter)->utc(),
                ),
            )
            ->orderBy('id')
            ->with([
                'assignee',
                'report.reporter',
                'completion',
            ]);
        $assignments = $query
            ->cursorPaginate((int) ($request->validated('per_page') ?? 100))
            ->withQueryString()
            ->appends(['sync_before' => $syncBefore->toISOString()]);

        return MobileFieldValidationAssignmentResource::collection($assignments)->additional([
            'sync' => [
                'before' => $syncBefore->toISOString(),
                'version' => $version,
                'total' => $total,
                'truncated' => $truncated,
                'unchanged' => $unchanged,
            ],
        ]);
    }

    /**
     * Picks the rows a phone receives: active work first (completed visits
     * waiting on the office last), then the earliest target visit date with
     * undated work after dated work, then the oldest assignment.
     *
     * @param  Builder<FieldValidationAssignment>  $owned
     * @return array{0: array<int, int>, 1: int}
     */
    private function selectWorkSet(Builder $owned): array
    {
        $rows = (clone $owned)
            ->with('report:id,field_validation_state')
            ->get(['id', 'report_id', 'target_visit_date', 'activated_at']);

        $ids = $rows
            ->sortBy([
                fn ($a, $b) => (int) ($a->report->field_validation_state === Report::FIELD_VALIDATION_STATE_COMPLETED)
                    <=> (int) ($b->report->field_validation_state === Report::FIELD_VALIDATION_STATE_COMPLETED),
                fn ($a, $b) => (int) ($a->target_visit_date === null) <=> (int) ($b->target_visit_date === null),
                fn ($a, $b) => $a->target_visit_date?->format('Y-m-d') <=> $b->target_visit_date?->format('Y-m-d'),
                fn ($a, $b) => $a->activated_at <=> $b->activated_at,
                fn ($a, $b) => $a->getKey() <=> $b->getKey(),
            ])
            ->take(self::WORK_SET_CAP)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->sort()
            ->values()
            ->all();

        return [$ids, $rows->count()];
    }

    /**
     * A digest of everything the phone would store for the selected rows.
     * It hashes raw assignment, report and completion attributes, so a
     * reassignment, removal, closure or case-information edit changes it.
     *
     * @param  array<int, int>  $ids
     */
    private function workSetVersion(array $ids, int $total, int|string $assigneeId): string
    {
        /** @var Collection<int, FieldValidationAssignment> $rows */
        $rows = FieldValidationAssignment::query()
            ->whereIn('id', $ids)
            ->orderBy('id')
            ->with(['report', 'completion'])
            ->get();

        // Previous-visit context comes from earlier completions of the same
        // owner, so their count and latest change are part of the digest.
        $completions = FieldValidationCompletion::query()
            ->whereHas('assignment', fn ($query) => $query->where('assignee_id', $assigneeId))
            ->selectRaw('count(*) as total, max(id) as latest_id, max(updated_at) as latest_at')
            ->first();

        $payload = [
            'total' => $total,
            'completions' => $completions?->getAttributes(),
            'rows' => $rows->map(fn (FieldValidationAssignment $row): array => [
                $row->getAttributes(),
                $row->report->getAttributes(),
                $row->completion?->getAttributes(),
            ])->all(),
        ];

        return substr(hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE)), 0, 32);
    }
}
