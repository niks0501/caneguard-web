<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\MobileFieldValidationAssignmentRequest;
use App\Http\Resources\MobileFieldValidationAssignmentResource;
use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Support\MobilePreviousVisit;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;

class MobileFieldValidationAssignmentController extends Controller
{
    /**
     * The most assignments one phone downloads. A larger work set is cut to
     * the highest-priority rows and reported through sync.total/truncated.
     */
    public const WORK_SET_CAP = 300;

    /** Held assignment columns the feed serializes. */
    private const ASSIGNMENT_VERSION_FIELDS = [
        'uuid',
        'target_visit_date',
        'activated_at',
        'updated_at',
    ];

    /** Report columns the feed serializes in `case`, plus the district its previous visit resolves in. */
    private const REPORT_VERSION_FIELDS = [
        'uuid',
        'client_uuid',
        'reference_code',
        'district_id',
        'barangay',
        'province',
        'municipality',
        'farmer_or_farm_owner_name',
        'affected_area_hectares',
        'affected_portion_percent',
        'captured_at',
        'observed_at',
        'submitted_at',
        'predicted_label',
        'confidence',
    ];

    public function __invoke(
        MobileFieldValidationAssignmentRequest $request,
    ): AnonymousResourceCollection|JsonResponse {
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

        /** @var Collection<int, FieldValidationAssignment> $ownedRows */
        $ownedRows = (clone $owned)
            ->orderBy('id')
            ->with(['assignee', 'report.reporter', 'completion'])
            ->get();

        $total = $ownedRows->count();
        $selectedIds = $this->selectWorkSet($ownedRows);
        $truncated = $total > count($selectedIds);
        $version = $this->workSetVersion($ownedRows, $selectedIds);

        $cursor = $request->validated('cursor');
        $resumedVersion = $request->validated('sync_version');
        if ($cursor !== null && $resumedVersion !== null && $resumedVersion !== $version) {
            // The rows of one download must all come from the same snapshot;
            // a mid-download change would silently skip or duplicate rows.
            return response()->json([
                'message' => 'The assignment set changed during the download. Start the feed again.',
                'code' => 'SYNC_RESTART',
                'sync' => [
                    'before' => $syncBefore->toISOString(),
                    'version' => $version,
                    'total' => $total,
                    'truncated' => $truncated,
                    'unchanged' => false,
                ],
            ], 409);
        }

        // A phone that already holds this version needs no rows. A cursor
        // means it is mid-download, so the version shortcut never applies.
        $unchanged = $cursor === null
            && $request->validated('since') === $version;
        if ($unchanged) {
            $selectedIds = [];
        }

        $query = (clone $owned)
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
            ->appends([
                'sync_before' => $syncBefore->toISOString(),
                'sync_version' => $version,
            ]);

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
     * @param  Collection<int, FieldValidationAssignment>  $rows
     * @return array<int, int>
     */
    private function selectWorkSet(Collection $rows): array
    {
        return $rows
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
    }

    /**
     * A digest of everything the feed would store for this owner: every held
     * assignment with the report and identity fields it serializes, plus the
     * `previous_visit` payload each delivered row resolves.
     *
     * @param  Collection<int, FieldValidationAssignment>  $rows
     * @param  array<int, int>  $selectedIds
     */
    private function workSetVersion(Collection $rows, array $selectedIds): string
    {
        $wanted = array_flip($selectedIds);
        $previousVisits = $rows
            ->filter(fn (FieldValidationAssignment $row): bool => isset($wanted[(int) $row->getKey()]))
            ->map(fn (FieldValidationAssignment $row): ?array => MobilePreviousVisit::payload($row))
            ->values()
            ->all();

        $payload = [
            'rows' => $rows->map(fn (FieldValidationAssignment $row): array => [
                Arr::only($row->getAttributes(), self::ASSIGNMENT_VERSION_FIELDS),
                Arr::only($row->report->getAttributes(), self::REPORT_VERSION_FIELDS),
                $row->report->lifecycleSnapshot()['field_validation_state'],
                [$row->assignee?->uuid, $row->assignee?->name],
                [$row->report->reporter?->uuid, $row->report->reporter?->name],
            ])->all(),
            'previous_visits' => $previousVisits,
        ];

        return substr(hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE)), 0, 32);
    }
}
