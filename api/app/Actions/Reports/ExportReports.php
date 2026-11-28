<?php

namespace App\Actions\Reports;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Support\AreaFormatter;
use Illuminate\Database\Eloquent\Builder;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class ExportReports
{
    /**
     * Keep the export columns case-level and operational. In particular, the
     * possible AI condition is not an authority finding or a population-level
     * statistic.
     *
     * @var array<int, string>
     */
    public const HEADERS = [
        'case_reference',
        'submitted_date',
        'barangay',
        'farmer_or_farm_reference',
        'possible_ai_condition',
        'affected_area_hectares',
        'affected_area_measurement',
        'affected_portion_percent',
        'affected_portion_measurement',
        'work_status',
        'verification_outcome',
        'case_state',
        'field_validation_state',
        'staff_classified_condition',
        'location_unavailable',
        'location_unavailable_reason',
        'field_validator',
        'assigned_by',
        'target_visit_date',
        'action_taken',
        'referral_state',
        'referral_destination',
        'referral_reference',
        'referral_date',
        'plot_area_hectares',
        'plot_area_measurement',
    ];

    public function __construct(
        private readonly ApplyReportFilters $applyReportFilters,
        private readonly ApplyOperationalQueueFilter $applyOperationalQueueFilter,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     */
    public function handle(array $filters): StreamedResponse
    {
        $query = Report::query()->visibleTo(request()->user())
            ->whereNull('canonical_report_id')
            ->with([
                'reporter',
                'fieldValidationAssignment.assignee',
                'fieldValidationAssignment.assignedBy',
                'referral',
            ]);
        $this->applyReportFilters->handle($query, $filters, 'submitted_at');

        if (isset($filters['queue'])) {
            $this->applyOperationalQueueFilter->handle($query, $filters['queue']);
        }

        $this->applySort($query, $filters['sort'] ?? '-submitted_at');

        return response()->streamDownload(function () use ($query): void {
            $output = fopen('php://output', 'wb');
            if ($output === false) {
                return;
            }

            fputcsv($output, self::HEADERS);
            foreach ($query->lazy(500) as $report) {
                fputcsv($output, $this->row($report));
            }
            fclose($output);
        }, 'caneguard-case-export-'.now('Asia/Manila')->format('Y-m-d').'.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store, private',
        ]);
    }

    private function applySort(Builder $query, string $sort): void
    {
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

        [$column, $direction] = match ($sort) {
            'submitted_at' => ['submitted_at', 'asc'],
            default => ['submitted_at', 'desc'],
        };

        $query
            ->orderBy($column, $direction)
            ->orderBy('id');
    }

    /**
     * @return array<int, mixed>
     */
    private function row(Report $report): array
    {
        $lifecycle = $report->lifecycleSnapshot();
        $assignment = $report->fieldValidationAssignment;
        $referral = $report->referral;
        $plotMeasurement = $report->plotAreaMeasurement();
        $areaMeasurement = $report->affectedAreaMeasurement();
        $portionMeasurement = $report->affectedPortionMeasurement();

        return array_map(
            $this->neutralizeSpreadsheetFormula(...),
            [
                $report->reference_code,
                $report->submitted_at?->timezone('Asia/Manila')->toDateString() ?? '',
                $report->barangay,
                $report->farmer_or_farm_owner_name ?? '',
                $report->predicted_label === null
                    ? Report::NO_AI_SCAN_LABEL
                    : 'Possible '.$report->predicted_label,
                AreaFormatter::formatCsvHectares($report->affected_area_hectares, $areaMeasurement),
                AreaFormatter::measurementLabel($areaMeasurement),
                AreaFormatter::formatCsvPercent($report->affected_portion_percent, $portionMeasurement),
                AreaFormatter::measurementLabel($portionMeasurement),
                $report->review_status,
                $lifecycle['verification_outcome'],
                $lifecycle['case_state'],
                $lifecycle['field_validation_state'],
                $report->authority_classified_condition ?? '',
                $report->hasLocationUnavailable() ? 'yes' : 'no',
                $report->hasLocationUnavailable()
                    ? ($report->location_unavailable_reason ?? '')
                    : '',
                $assignment?->assignee?->name ?? '',
                $assignment?->assignedBy?->name ?? '',
                $assignment?->target_visit_date?->format('Y-m-d') ?? '',
                $report->action_taken ?? '',
                $lifecycle['referral_state'],
                $referral?->destination ?? '',
                $referral?->reference ?? '',
                $referral?->referral_date?->format('Y-m-d') ?? '',
                AreaFormatter::formatCsvHectares($report->plot_area_hectares, $plotMeasurement),
                AreaFormatter::measurementLabel($plotMeasurement),
            ],
        );
    }

    private function neutralizeSpreadsheetFormula(mixed $value): mixed
    {
        if (! is_string($value) || $value === '') {
            return $value;
        }

        return in_array($value[0], ['=', '+', '-', '@', "\t", "\r", "\n"], true)
            ? "'".$value
            : $value;
    }
}
