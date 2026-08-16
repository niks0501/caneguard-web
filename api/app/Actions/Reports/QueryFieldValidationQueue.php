<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Illuminate\Database\Eloquent\Collection;

class QueryFieldValidationQueue
{
    public function __construct(
        private readonly ApplyReportFilters $applyReportFilters,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array{items: Collection<int, Report>, count: int}
     */
    public function handle(array $filters): array
    {
        $query = Report::query()
            ->where('review_status', Report::STATUS_FOR_FIELD_VALIDATION);
        $query = $this->applyReportFilters->handle($query, $filters, 'observed_at');

        $count = (clone $query)->count('reports.id');
        $limit = (int) ($filters['limit'] ?? 50);
        $items = $query
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
                'gps_accuracy',
                'observed_at',
                'submitted_at',
                'predicted_label',
                'confidence',
                'affected_area_hectares',
                'affected_portion_percent',
                'review_status',
            ])
            ->orderByRaw('CASE WHEN observed_at IS NULL THEN 1 ELSE 0 END ASC')
            ->orderBy('observed_at')
            ->orderBy('submitted_at')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        return [
            'items' => $items,
            'count' => $count,
        ];
    }
}
