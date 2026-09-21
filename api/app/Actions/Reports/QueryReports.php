<?php

namespace App\Actions\Reports;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class QueryReports
{
    public function __construct(
        private readonly ApplyReportFilters $applyReportFilters,
        private readonly ApplyOperationalQueueFilter $applyOperationalQueueFilter,
        private readonly CalibrateReportTriage $calibrateReportTriage,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator<int, Report>
     */
    public function handle(array $filters): LengthAwarePaginator
    {
        $query = Report::query()
            ->whereNull('canonical_report_id')
            ->with([
                'reporter',
                'reviewer',
                'fieldValidationAssignment.assignee',
                'fieldValidationAssignment.assignedBy',
                'fieldValidationAssignment.completion',
                'qualityWarnings',
                'referral.expert',
            ]);
        $this->applyReportFilters->handle($query, $filters, 'submitted_at');
        if (isset($filters['queue'])) {
            $this->applyOperationalQueueFilter->handle($query, $filters['queue']);
        }

        $calibration = null;
        if (($filters['queue'] ?? null) === Report::QUEUE_NEEDS_REVIEW) {
            $calibration = $this->calibrateReportTriage->handle();
        }

        $this->applySort(
            $query,
            (string) ($filters['sort'] ?? '-submitted_at'),
            $calibration,
        );

        $paginator = $query
            ->paginate((int) ($filters['per_page'] ?? 15))
            ->withQueryString();

        if ($calibration !== null && $calibration['enabled']) {
            $paginator->getCollection()->each(function (Report $report) use ($calibration): void {
                $band = $this->calibrateReportTriage->classify($report, $calibration);
                $report->setAttribute('attention_band', $band['band']);
                $report->setAttribute('attention_band_reasons', $band['reasons']);
            });
        }

        return $paginator;
    }

    /**
     * Operational order for a work queue. The web workspace opens on the oldest
     * submission first, and the due view orders by the active target visit date
     * without issuing one query per row.
     *
     * @param  array{enabled: bool, green_min_confidence: float|null}|null  $calibration
     */
    private function applySort(
        Builder $query,
        string $sort,
        ?array $calibration,
    ): void {
        if ($calibration !== null && $calibration['enabled'] && $sort === 'submitted_at') {
            $this->applyTriageSort($query, $calibration);

            return;
        }

        if ($sort === 'due_soonest') {
            $query
                ->leftJoinSub(
                    FieldValidationAssignment::query()
                        ->selectRaw('report_id, MIN(target_visit_date) as due_on')
                        ->whereNotNull('target_visit_date')
                        ->groupBy('report_id'),
                    'due_assignments',
                    'due_assignments.report_id',
                    '=',
                    'reports.id',
                )
                ->select('reports.*')
                ->orderByRaw('due_assignments.due_on is null')
                ->orderBy('due_assignments.due_on')
                ->orderBy('reports.submitted_at')
                ->orderBy('reports.id');

            return;
        }

        $query
            ->when(
                $sort === '-submitted_at',
                fn (Builder $query) => $query
                    ->orderByDesc('submitted_at')
                    ->orderByDesc('id'),
                fn (Builder $query) => $query
                    ->orderBy('submitted_at')
                    ->orderBy('id'),
            );
    }

    /**
     * Keep attention ordering explainable: red uncertainty first, then amber,
     * then calibrated green. This changes order only after calibration exists.
     *
     * @param  array{green_min_confidence: float|null}  $calibration
     */
    private function applyTriageSort(Builder $query, array $calibration): void
    {
        $greenThreshold = $calibration['green_min_confidence'] ?? 1.001;
        $greenThresholdSql = number_format($greenThreshold, 7, '.', '');
        $qualityWarningExists = 'exists (select 1 from report_quality_warnings '
            .'where report_quality_warnings.report_id = reports.id)';

        $query
            ->orderByRaw("case
                when reports.verification_outcome = 'unable_to_verify'
                    or reports.mismatch_reported = 1
                    or reports.checklist_consistency in ('inconsistent', 'inconclusive')
                    or reports.reported_severity = 'high'
                    or reports.location_source <> 'gps'
                    or reports.gps_accuracy is null
                    or reports.reporter_suspected_condition is not null
                    or {$qualityWarningExists}
                    then 0
                when reports.confidence >= {$greenThresholdSql}
                    and reports.checklist_consistency = 'consistent'
                    and reports.mismatch_reported = 0
                    and reports.reported_severity <> 'high'
                    and reports.location_source = 'gps'
                    and reports.gps_accuracy is not null
                    and reports.reporter_suspected_condition is null
                    and not {$qualityWarningExists}
                    then 2
                else 1
            end")
            ->orderBy('submitted_at')
            ->orderBy('id');
    }
}
