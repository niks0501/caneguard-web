<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\ReportReferral;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

final class BuildMonthlyReportSummary
{
    /**
     * Build descriptive metrics for cases submitted during one UTC calendar
     * month. Every metric is scoped to submitted case records, rather than
     * attempting to infer a population-level disease statistic.
     *
     * @return array<string, mixed>
     */
    public function handle(?string $month = null): array
    {
        $periodStart = $month === null
            ? now()->utc()->startOfMonth()
            : CarbonImmutable::createFromFormat('!Y-m', $month, 'UTC');
        $periodEnd = $periodStart->addMonth();

        $baseQuery = Report::query()
            ->whereNull('canonical_report_id')
            ->where('submitted_at', '>=', $periodStart)
            ->where('submitted_at', '<', $periodEnd);

        return $this->buildFromQuery($baseQuery, $periodStart->format('Y-m'), [
            'from' => $periodStart->toDateString(),
            'to' => $periodEnd->subDay()->toDateString(),
        ]);
    }

    /**
     * Build the same metrics for a caller-owned, already scoped report query.
     * The document report uses this seam so the existing UTC monthly summary
     * remains behaviourally identical while other periods share its metrics.
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
        $expertVerification = $this->expertVerificationMetrics($baseQuery);

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
            'field_validation_counts' => $fieldValidationCounts,
            'closed_cases' => (clone $baseQuery)
                ->where('case_state', Report::CASE_STATE_CLOSED)
                ->count('reports.id'),
            'review_time' => $reviewTimes,
            'expert_verification' => $expertVerification,
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
     * Keep the feedback loop descriptive and scoped to consults for cases in
     * the selected reporting period. These metrics read only the immutable
     * report evidence and the attributed consult/advisory records.
     *
     * @return array<string, mixed>
     */
    private function expertVerificationMetrics(Builder $baseQuery): array
    {
        $consults = ReportReferral::query()
            ->with('report')
            ->whereIn('report_id', (clone $baseQuery)->select('reports.id'))
            ->orderBy('id')
            ->get();
        $completedConsults = $consults->where(
            'consult_status',
            ReportReferral::STATUS_COMPLETED,
        )->values();
        $consultCases = $consults->pluck('report_id')->unique()->values();
        $completedWithClassification = $completedConsults
            ->filter(fn (ReportReferral $consult): bool => filled(
                $consult->report?->authority_classified_condition,
            ) && $consult->report?->authority_classified_condition
                !== Report::AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY)
            ->values();
        $symptomEvidenceConsults = $completedConsults
            ->filter(fn (ReportReferral $consult): bool => in_array(
                $consult->report?->checklist_consistency,
                ['consistent', 'inconsistent', 'inconclusive'],
                true,
            ))
            ->values();

        $unableToClassify = $completedConsults
            ->filter(fn (ReportReferral $consult): bool => $consult->report?->authority_classified_condition
                === Report::AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY)
            ->count();
        $agreementCount = $completedWithClassification
            ->filter(fn (ReportReferral $consult): bool => $consult->report
                && $consult->report->authority_classified_condition === $consult->report->predicted_label)
            ->count();
        $symptomDisagreement = $symptomEvidenceConsults
            ->filter(fn (ReportReferral $consult): bool => $consult->report
                && $consult->report->checklist_consistency === 'inconsistent')
            ->count();
        $findingDurations = $completedConsults
            ->map(fn (ReportReferral $consult): ?float => $this->findingDurationHours($consult))
            ->filter(fn (?float $hours): bool => $hours !== null)
            ->values()
            ->all();

        return [
            'unable_to_classify_rate' => $this->rateMetric(
                $unableToClassify,
                $completedConsults->count(),
            ),
            'consult_volume' => [
                'total' => $consults->count(),
                'consulted_cases' => $consultCases->count(),
                ...$this->statusCounts($consults),
            ],
            'time_to_finding' => $this->durationMetric($findingDurations),
            'advisory_coverage' => $this->advisoryCoverage(
                $consults,
                $consultCases->count(),
            ),
            'expert_agreement' => $this->rateMetric(
                $agreementCount,
                $completedWithClassification->count(),
            ),
            'symptom_verification_disagreement' => $this->rateMetric(
                $symptomDisagreement,
                $symptomEvidenceConsults->count(),
            ),
        ];
    }

    /**
     * @param  Collection<int, ReportReferral>  $consults
     * @return array{pending: int, in_progress: int, completed: int, cancelled: int}
     */
    private function statusCounts(Collection $consults): array
    {
        $counts = [];
        foreach (ReportReferral::statuses() as $status) {
            $counts[$status] = $consults->where('consult_status', $status)->count();
        }

        return $counts;
    }

    /**
     * @param  Collection<int, ReportReferral>  $consults
     * @return array{consult_cases: int, cases_with_advisory: int, coverage_rate: float|null, delivered_cases: int, acknowledged_cases: int}
     */
    private function advisoryCoverage(Collection $consults, int $consultCases): array
    {
        $reportsWithAdvisory = $consults
            ->filter(fn (ReportReferral $consult): bool => $consult->report?->advisory_id !== null)
            ->pluck('report_id')
            ->unique()
            ->count();
        $delivered = $consults
            ->filter(fn (ReportReferral $consult): bool => in_array(
                $consult->report?->advisory_delivery_state,
                [Report::ADVISORY_DELIVERY_DELIVERED, Report::ADVISORY_DELIVERY_ACKNOWLEDGED],
                true,
            ))
            ->pluck('report_id')
            ->unique()
            ->count();
        $acknowledged = $consults
            ->filter(fn (ReportReferral $consult): bool => $consult->report?->advisory_delivery_state
                === Report::ADVISORY_DELIVERY_ACKNOWLEDGED)
            ->pluck('report_id')
            ->unique()
            ->count();

        return [
            'consult_cases' => $consultCases,
            'cases_with_advisory' => $reportsWithAdvisory,
            'coverage_rate' => $this->rate($reportsWithAdvisory, $consultCases),
            'delivered_cases' => $delivered,
            'acknowledged_cases' => $acknowledged,
        ];
    }

    /**
     * @param  array<int, float>  $durations
     * @return array{source: string, findings: int, average_hours: float|null, median_hours: float|null, min_hours: float|null, max_hours: float|null}
     */
    private function durationMetric(array $durations): array
    {
        if ($durations === []) {
            return [
                'source' => 'referral_date_to_finding_recorded_at',
                'findings' => 0,
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
            'source' => 'referral_date_to_finding_recorded_at',
            'findings' => $count,
            'average_hours' => round(array_sum($durations) / $count, 2),
            'median_hours' => round($median, 2),
            'min_hours' => $durations[0],
            'max_hours' => $durations[$count - 1],
        ];
    }

    private function findingDurationHours(ReportReferral $consult): ?float
    {
        $consultStartedAt = $consult->referral_date?->startOfDay();
        if ($consultStartedAt === null) {
            $consultStartedAt = $consult->created_at;
        }

        $findingAt = $consult->finding_recorded_at;
        if ($findingAt === null
            && (filled($consult->finding_summary)
                || filled($consult->finding_details)
                || filled($consult->finding_recommendation))
        ) {
            $findingAt = $consult->response_recorded_at;
        }

        if ($consultStartedAt === null
            || $findingAt === null
            || $findingAt->lt($consultStartedAt)
        ) {
            return null;
        }

        return round($consultStartedAt->diffInSeconds($findingAt) / 3600, 2);
    }

    /**
     * @return array{count: int, denominator: int, rate: float|null, percentage: float|null}
     */
    private function rateMetric(int $count, int $denominator): array
    {
        $rate = $this->rate($count, $denominator);

        return [
            'count' => $count,
            'denominator' => $denominator,
            'rate' => $rate,
            'percentage' => $rate === null ? null : round($rate * 100, 2),
        ];
    }

    private function rate(int $count, int $denominator): ?float
    {
        return $denominator === 0 ? null : round($count / $denominator, 4);
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
