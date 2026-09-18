<?php

namespace App\Actions\Reports;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use Illuminate\Database\Eloquent\Collection;

class QueryFieldValidationQueue
{
    public function __construct(
        private readonly ApplyReportFilters $applyReportFilters,
        private readonly ApplyOperationalQueueFilter $applyOperationalQueueFilter,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array{queue: string, items: Collection<int, Report>, count: int}
     */
    public function handle(array $filters): array
    {
        $queue = $filters['queue'] ?? Report::QUEUE_NEEDS_VISIT;
        $query = Report::query();
        $this->applyOperationalQueueFilter->handle($query, $queue);
        $this->applyReportFilters->handle($query, $filters, 'observed_at');

        $count = (clone $query)->count('reports.id');
        $limit = (int) ($filters['limit'] ?? 50);
        $items = $query
            ->with('fieldValidationAssignment')
            ->select([
                'id',
                'uuid',
                'reference_code',
                'barangay',
                'province',
                'municipality',
                'final_latitude',
                'final_longitude',
                'location_source',
                'location_unavailable_reason',
                'gps_accuracy',
                'observed_at',
                'submitted_at',
                'predicted_label',
                'confidence',
                'affected_area_hectares',
                'affected_portion_percent',
                'review_status',
                'case_state',
                'verification_outcome',
                'field_validation_state',
                'referral_state',
            ])
            ->when(
                $queue === Report::QUEUE_FOLLOW_UP_DUE,
                fn ($query) => $query->orderBy(
                    FieldValidationAssignment::select('target_visit_date')
                        ->whereColumn('report_id', 'reports.id'),
                ),
            )
            ->orderByRaw('CASE WHEN observed_at IS NULL THEN 1 ELSE 0 END ASC')
            ->orderBy('observed_at')
            ->orderBy('submitted_at')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        return [
            'queue' => $queue,
            'items' => $items,
            'count' => $count,
        ];
    }
}
