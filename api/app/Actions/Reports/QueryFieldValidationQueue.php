<?php

namespace App\Actions\Reports;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

class QueryFieldValidationQueue
{
    public function __construct(
        private readonly ApplyReportFilters $applyReportFilters,
        private readonly ApplyOperationalQueueFilter $applyOperationalQueueFilter,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array{queue: string, items: Collection<int, Report>, count: int, total: int, page: int, limit: int}
     */
    public function handle(array $filters): array
    {
        $queue = $filters['queue'] ?? Report::QUEUE_NEEDS_VISIT;
        $query = Report::query()->visibleTo(request()->user())->whereNull('canonical_report_id');
        $this->applyOperationalQueueFilter->handle($query, $queue);
        $this->applyReportFilters->handle($query, $filters, 'observed_at');
        if (isset($filters['due_from']) || isset($filters['due_to'])) {
            $query->whereHas('fieldValidationAssignment', function (Builder $query) use ($filters): void {
                $query
                    ->when(
                        $filters['due_from'] ?? null,
                        fn (Builder $query, string $date) => $query->whereDate('target_visit_date', '>=', $date),
                    )
                    ->when(
                        $filters['due_to'] ?? null,
                        fn (Builder $query, string $date) => $query->whereDate('target_visit_date', '<=', $date),
                    );
            });
        }

        if (isset($filters['assignment'])) {
            if ($filters['assignment'] === 'unassigned') {
                $query->whereDoesntHave('fieldValidationAssignment');
            } elseif ($filters['assignment'] === 'mine' && auth()->check()) {
                $query->whereHas('fieldValidationAssignment', function ($q) {
                    $q->where('assignee_id', auth()->id());
                });
            }
        }

        $count = (clone $query)->count('reports.id');
        $limit = (int) ($filters['limit'] ?? 50);
        $page = max(1, (int) ($filters['page'] ?? 1));
        $offset = ($page - 1) * $limit;
        $items = $query
            ->with('fieldValidationAssignment.assignee')
            ->select([
                'id',
                'uuid',
                'reference_code',
                'barangay',
                'farmer_or_farm_owner_name',
                'province',
                'municipality',
                'final_latitude',
                'final_longitude',
                'location_source',
                'location_unavailable_reason',
                'gps_accuracy',
                'observed_at',
                'submitted_at',
                'first_reviewed_at',
                'predicted_label',
                'confidence',
                'authority_classified_condition',
                'mismatch_reported',
                'action_taken',
                'affected_area_hectares',
                'affected_area_measurement',
                'affected_portion_percent',
                'scheduled_revisit',
                'review_status',
                'case_state',
                'verification_outcome',
                'field_validation_state',
                'referral_state',
                'lock_version',
            ])
            ->when(
                in_array($queue, [
                    Report::QUEUE_FOLLOW_UP_DUE,
                    Report::QUEUE_UPCOMING,
                ], true),
                fn ($query) => $query->orderBy(
                    FieldValidationAssignment::select('target_visit_date')
                        ->whereColumn('report_id', 'reports.id'),
                ),
            )
            ->orderByRaw('CASE WHEN observed_at IS NULL THEN 1 ELSE 0 END ASC')
            ->orderBy('observed_at')
            ->orderBy('submitted_at')
            ->orderBy('id')
            ->offset($offset)
            ->limit($limit)
            ->get();

        return [
            'queue' => $queue,
            'items' => $items,
            'count' => $count,
            'total' => $count,
            'page' => $page,
            'limit' => $limit,
        ];
    }
}
