<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

final class BuildMonthlyReportSummary
{
    public const TIMEZONE = 'Asia/Manila';

    /**
     * Build descriptive metrics for cases submitted during one Asia/Manila
     * calendar month. UTC instants are used only for database comparisons.
     * Every metric is scoped to submitted case records, rather than attempting
     * to infer a population-level disease statistic.
     *
     * @return array<string, mixed>
     */
    public function handle(?string $month = null): array
    {
        $periodStart = $month === null
            ? CarbonImmutable::now(self::TIMEZONE)->startOfMonth()
            : CarbonImmutable::createFromFormat('!Y-m', $month, self::TIMEZONE);
        $periodEnd = $periodStart->addMonth();

        $baseQuery = Report::query()
            ->whereNull('canonical_report_id')
            ->where('submitted_at', '>=', $periodStart->utc())
            ->where('submitted_at', '<', $periodEnd->utc());

        return $this->buildFromQuery($baseQuery, $periodStart->format('Y-m'), [
            'from' => $periodStart->toDateString(),
            'to' => $periodEnd->subDay()->toDateString(),
        ]);
    }

    /**
     * Build the same metrics for a caller-owned, already scoped report query.
     * Document and analytics periods use this seam to share monthly metrics.
     *
     * @return array<string, mixed>
     */
    public function buildFromQuery(
        Builder $baseQuery,
        ?string $month = null,
        ?array $period = null,
    ): array {
        $reportedCases = (clone $baseQuery)->count('reports.id');
        $fieldValidationCounts = $this->fieldValidationCounts($baseQuery);
        $reviewTimes = $this->reviewTimes($baseQuery);

        return [
            'month' => $month,
            'period' => $period ?? ['from' => null, 'to' => null],
            'reported_cases' => $reportedCases,
            'cases_by_barangay' => $this->groupedCounts(
                $baseQuery,
                'barangay',
                'barangay',
            ),
            'cases_by_possible_condition' => $this->groupedCounts(
                $baseQuery,
                'predicted_label',
                'possible_condition',
            ),
            'estimated_affected_hectares' => round(
                (float) ((clone $baseQuery)->sum('affected_area_hectares')),
                2,
            ),
            'reports_containing_farmer_farm_information' => (clone $baseQuery)
                ->whereNotNull('farmer_or_farm_owner_name')
                ->whereRaw("TRIM(farmer_or_farm_owner_name) <> ''")
                ->count('reports.id'),
            'field_validation_counts' => $fieldValidationCounts,
            'closed_cases' => (clone $baseQuery)
                ->where('case_state', Report::CASE_STATE_CLOSED)
                ->count('reports.id'),
            'review_time' => $reviewTimes,
        ];
    }

    /**
     * @return array<int, array{barangay?: string, possible_condition?: string, reported_cases: int}>
     */
    private function groupedCounts(
        Builder $baseQuery,
        string $column,
        string $outputKey,
    ): array {
        return (clone $baseQuery)
            ->select($column)
            ->selectRaw('COUNT(*) AS reported_cases')
            ->groupBy($column)
            ->orderByDesc('reported_cases')
            ->orderBy($column)
            ->get()
            ->map(fn (Report $report): array => [
                $outputKey => $report->getAttribute($column),
                'reported_cases' => (int) $report->getAttribute('reported_cases'),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array{unassigned: int, assigned: int, in_progress: int, completed: int, requiring_validation: int}
     */
    private function fieldValidationCounts(Builder $baseQuery): array
    {
        $counts = array_fill_keys(Report::fieldValidationStates(), 0);

        (clone $baseQuery)
            ->select('field_validation_state')
            ->selectRaw('COUNT(*) AS state_count')
            ->groupBy('field_validation_state')
            ->get()
            ->each(function (Report $report) use (&$counts): void {
                $state = (string) $report->getAttribute('field_validation_state');
                if (array_key_exists($state, $counts)) {
                    $counts[$state] = (int) $report->getAttribute('state_count');
                }
            });

        return [
            ...$counts,
            'requiring_validation' => $counts[Report::FIELD_VALIDATION_STATE_ASSIGNED]
                + $counts[Report::FIELD_VALIDATION_STATE_IN_PROGRESS],
        ];
    }

    /**
     * Only non-negative submission-to-review intervals are supported. Rows
     * without both timestamps, or with an inconsistent clock order, are not
     * presented as a made-up duration.
     *
     * @return array{source: string, reviewed_cases: int, average_hours: float|null, median_hours: float|null, min_hours: float|null, max_hours: float|null}
     */
    private function reviewTimes(Builder $baseQuery): array
    {
        $durations = (clone $baseQuery)
            ->whereNotNull('reviewed_at')
            ->get(['submitted_at', 'reviewed_at'])
            ->map(function (Report $report): ?float {
                $submittedAt = $report->submitted_at;
                $reviewedAt = $report->reviewed_at;

                if ($submittedAt === null
                    || $reviewedAt === null
                    || $reviewedAt->lt($submittedAt)
                ) {
                    return null;
                }

                return round($submittedAt->diffInSeconds($reviewedAt) / 3600, 2);
            })
            ->filter(fn (?float $hours): bool => $hours !== null)
            ->values()
            ->all();

        if ($durations === []) {
            return [
                'source' => 'submitted_at_to_reviewed_at',
                'reviewed_cases' => 0,
                'average_hours' => null,
                'median_hours' => null,
                'min_hours' => null,
                'max_hours' => null,
            ];
        }

        sort($durations, SORT_NUMERIC);
        $count = count($durations);
        $middle = intdiv($count, 2);
        $median = $count % 2 === 0
            ? ($durations[$middle - 1] + $durations[$middle]) / 2
            : $durations[$middle];

        return [
            'source' => 'submitted_at_to_reviewed_at',
            'reviewed_cases' => $count,
            'average_hours' => round(array_sum($durations) / $count, 2),
            'median_hours' => round($median, 2),
            'min_hours' => $durations[0],
            'max_hours' => $durations[$count - 1],
        ];
    }
}
