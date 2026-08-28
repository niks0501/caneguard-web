<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Illuminate\Database\Eloquent\Collection;

class QueryMapReports
{
    public function __construct(
        private readonly ApplyReportFilters $applyReportFilters,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array{reports: Collection<int, Report>, total_count: int, located_count: int, unlocated_count: int}
     */
    public function handle(array $filters): array
    {
        $query = $this->applyReportFilters->handle(
            Report::query(),
            $filters,
            'observed_at',
        );

        if (! array_key_exists('status', $filters)) {
            $query->where('review_status', '!=', Report::STATUS_RESOLVED);
        }

        $totalCount = (clone $query)->count('reports.id');
        $locatedQuery = (clone $query)
            ->whereNotNull('final_latitude')
            ->whereNotNull('final_longitude')
            ->whereBetween('final_latitude', [-90, 90])
            ->whereBetween('final_longitude', [-180, 180]);
        $locatedCount = (clone $locatedQuery)->count('reports.id');
        $reports = $locatedQuery
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
                'case_state',
                'verification_outcome',
                'field_validation_state',
                'referral_state',
            ])
            ->orderBy('id')
            ->get();

        return [
            'reports' => $reports,
            'total_count' => $totalCount,
            'located_count' => $locatedCount,
            'unlocated_count' => $totalCount - $locatedCount,
        ];
    }
}
