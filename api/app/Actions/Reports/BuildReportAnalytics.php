<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

/**
 * Period trend, composition and operational analytics (charts plan
 * Phase 1: C1–C4, C11; Phase 2: C5–C9, C12).
 *
 * Extends the documents track's Phase 0 period groundwork instead of
 * rebuilding it: PHT (Asia/Manila) boundaries, weekly/monthly/custom
 * resolution via from/to dates, and the 366-day range cap. The monthly
 * builder is reused through its buildFromQuery seam so dashboard summaries,
 * analytics and generated documents share scoped aggregates; only the new
 * buckets, open/closed split and previous-window comparison live here.
 *
 * Scope parity with the CSV export is structural: the base query applies
 * canonical_report_id IS NULL plus ApplyReportFilters (and the operational
 * queue filter when requested), the same actions ExportReports uses.
 */
final class BuildReportAnalytics
{
    public const TIMEZONE = 'Asia/Manila';

    public const TIMEZONE_LABEL = 'PHT (UTC+8)';

    public const MAX_RANGE_DAYS = 366;

    public const MAX_DAY_BUCKETS = 62;

    public function __construct(
        private readonly ApplyReportFilters $applyReportFilters,
        private readonly ApplyOperationalQueueFilter $applyOperationalQueueFilter,
        private readonly BuildMonthlyReportSummary $buildMonthlyReportSummary,
    ) {}

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function handle(array $input): array
    {
        $granularity = (string) ($input['granularity'] ?? 'week');
        if (! in_array($granularity, ['day', 'week'], true)) {
            throw $this->invalid('granularity', 'The granularity must be day or week.');
        }

        [$start, $end] = $this->resolveWindow($input);
        $days = $start->diffInDays($end);
        if ($days < 1 || $days > self::MAX_RANGE_DAYS) {
            throw $this->invalid('to', 'Custom ranges cannot exceed 366 days.');
        }
        if ($granularity === 'day' && $days > self::MAX_DAY_BUCKETS) {
            throw $this->invalid(
                'granularity',
                'Day buckets are supported for ranges up to 62 days. Use week buckets for longer ranges.',
            );
        }

        $filters = $this->filters($input);
        $base = $this->scopedQuery($start, $end, $filters);
        $metrics = $this->buildMonthlyReportSummary->buildFromQuery(
            clone $base,
            null,
            [
                'from' => $start->toDateString(),
                'to' => $end->subDay()->toDateString(),
            ],
        );

        $total = (int) $metrics['reported_cases'];
        $closed = (int) $metrics['closed_cases'];

        [$previousStart, $previousEnd] = [$start->subDays($days), $start];
        $previousTotal = $this->scopedQuery($previousStart, $previousEnd, $filters)
            ->count('reports.id');

        return [
            'period' => [
                'from' => $start->toDateString(),
                'to' => $end->subDay()->toDateString(),
                'granularity' => $granularity,
                'label' => $this->label($start, $end, $days),
                'timezone' => self::TIMEZONE,
                'timezone_label' => self::TIMEZONE_LABEL,
                'days' => $days,
                'partial' => $this->isPartial($end),
            ],
            'filters' => (object) $filters,
            'total_submitted' => $total,
            'series' => $this->buckets(clone $base, $start, $end, $granularity),
            'cases_by_barangay' => $metrics['cases_by_barangay'],
            'cases_by_possible_condition' => $metrics['cases_by_possible_condition'],
            'case_state' => [
                'open' => $total - $closed,
                'closed' => $closed,
            ],
            'comparison' => [
                'previous_from' => $previousStart->toDateString(),
                'previous_to' => $previousEnd->subDay()->toDateString(),
                'previous_total' => $previousTotal,
                'current_total' => $total,
                'delta' => $total - $previousTotal,
            ],
            'lifecycle' => $this->lifecycle(clone $base),
            'area' => $this->area(clone $base, $start, $end, $filters),
            'validation_workload' => $this->validationWorkload(clone $base),
            'validation_schedule' => $this->validationSchedule(clone $base),
            'review_backlog' => $this->reviewBacklog(clone $base),
            'validation_turnaround' => $this->validationTurnaround(clone $base),
        ];
    }

    /**
     * Resolve the inclusive from/to PHT calendar dates into a half-open
     * [start, end) window. Returns PHT-anchored instants; callers convert to
     * UTC for database comparisons.
     *
     * @param  array<string, mixed>  $input
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public function resolveWindow(array $input): array
    {
        try {
            $start = CarbonImmutable::createFromFormat(
                '!Y-m-d',
                (string) ($input['from'] ?? ''),
                self::TIMEZONE,
            )->startOfDay();
            $end = CarbonImmutable::createFromFormat(
                '!Y-m-d',
                (string) ($input['to'] ?? ''),
                self::TIMEZONE,
            )->addDay()->startOfDay();
        } catch (\Throwable) {
            throw $this->invalid('from', 'A valid from and to date are required.');
        }

        if ($end->lessThanOrEqualTo($start)) {
            throw $this->invalid('to', 'The range must end on or after its start date.');
        }

        return [$start, $end];
    }

    /** @param  array<string, mixed>  $input @return array<string, mixed> */
    private function filters(array $input): array
    {
        $keys = [
            'search', 'status', 'case_state', 'verification_outcome',
            'field_validation_state', 'authority_classified_condition',
            'concern', 'follow_up_outcome', 'referral', 'predicted_label',
            'barangay', 'queue', 'date_from', 'date_to',
        ];

        return array_filter(
            array_intersect_key($input, array_flip($keys)),
            static fn (mixed $value): bool => $value !== null && $value !== '',
        );
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function scopedQuery(
        CarbonImmutable $start,
        CarbonImmutable $end,
        array $filters,
    ): Builder {
        $query = Report::query()
            ->whereNull('canonical_report_id')
            ->where('submitted_at', '>=', $start->utc())
            ->where('submitted_at', '<', $end->utc());

        $this->applyReportFilters->handle($query, $filters);
        if (isset($filters['queue'])) {
            $this->applyOperationalQueueFilter->handle($query, $filters['queue']);
        }

        return $query;
    }

    /**
     * Bucket submitted reports per PHT calendar day, or per ISO week starting
     * Monday. Every bucket in the window is present, including empty ones, so
     * a quiet stretch renders as zero rather than disappearing.
     *
     * @return array<int, array{label: string, count: int}>
     */
    private function buckets(
        Builder $query,
        CarbonImmutable $start,
        CarbonImmutable $end,
        string $granularity,
    ): array {
        $counts = [];
        foreach ($query->get(['submitted_at']) as $report) {
            if (! $report->submitted_at) {
                continue;
            }
            $date = $report->submitted_at->timezone(self::TIMEZONE);
            $key = $granularity === 'week'
                ? $date->startOfWeek(CarbonImmutable::MONDAY)->toDateString()
                : $date->toDateString();
            $counts[$key] = ($counts[$key] ?? 0) + 1;
        }

        $buckets = [];
        $cursor = $granularity === 'week'
            ? $start->startOfWeek(CarbonImmutable::MONDAY)
            : $start;
        $step = $granularity === 'week' ? 'addWeek' : 'addDay';
        while ($cursor->lessThan($end)) {
            $key = $cursor->toDateString();
            $buckets[] = ['label' => $key, 'count' => $counts[$key] ?? 0];
            $cursor = $cursor->$step();
        }

        return $buckets;
    }

    /**
     * Where submitted reports sit in the lifecycle (C5). Every known state
     * is present, including empty ones. Referral stays a supporting state
     * split here, never an independent process stream.
     *
     * @return array<string, array<string, int>>
     */
    private function lifecycle(Builder $base): array
    {
        $dimensions = [
            'verification_outcome' => Report::verificationOutcomes(),
            'field_validation_state' => Report::fieldValidationStates(),
            'referral_state' => Report::referralStates(),
        ];
        $result = [];
        foreach ($dimensions as $column => $states) {
            $counts = array_fill_keys($states, 0);
            (clone $base)
                ->select($column)
                ->selectRaw('COUNT(*) AS state_count')
                ->groupBy($column)
                ->get()
                ->each(function (Report $report) use ($column, &$counts): void {
                    $state = (string) $report->getAttribute($column);
                    if (array_key_exists($state, $counts)) {
                        $counts[$state] = (int) $report->getAttribute('state_count');
                    }
                });
            $result[$column] = $counts;
        }

        return $result;
    }

    /**
     * Estimated affected area with provenance and overlap disclosure (C6).
     * The unit is never a bare total: contributing report count, the
     * measured/not-measured split, the linked duplicates excluded from the
     * sum, and the overlap acknowledgement travel with the number.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function area(
        Builder $base,
        CarbonImmutable $start,
        CarbonImmutable $end,
        array $filters,
    ): array {
        $estimatedHectares = 0.0;
        $measuredHectares = 0.0;
        $notMeasuredHectares = 0.0;
        $contributing = 0;
        $measuredReports = 0;
        $notMeasuredReports = 0;

        foreach ((clone $base)->get(['affected_area_hectares', 'affected_area_measurement']) as $report) {
            if ($report->affected_area_hectares === null) {
                continue;
            }
            $hectares = (float) $report->affected_area_hectares;
            $contributing++;
            $estimatedHectares += $hectares;
            if (($report->affected_area_measurement ?? Report::MEASUREMENT_MEASURED) === Report::MEASUREMENT_MEASURED) {
                $measuredReports++;
                $measuredHectares += $hectares;
            } else {
                $notMeasuredReports++;
                $notMeasuredHectares += $hectares;
            }
        }

        $duplicates = Report::query()
            ->whereNotNull('canonical_report_id')
            ->where('submitted_at', '>=', $start->utc())
            ->where('submitted_at', '<', $end->utc())
            ->tap(fn (Builder $query) => $this->applyReportFilters->handle($query, $filters))
            ->when(isset($filters['queue']), fn (Builder $query) => $this->applyOperationalQueueFilter->handle($query, $filters['queue']))
            ->count('reports.id');

        return [
            'estimated_hectares' => round($estimatedHectares, 2),
            'contributing_reports' => $contributing,
            'measured_reports' => $measuredReports,
            'measured_hectares' => round($measuredHectares, 2),
            'not_measured_reports' => $notMeasuredReports,
            'not_measured_hectares' => round($notMeasuredHectares, 2),
            'linked_duplicates_excluded' => $duplicates,
            'overlap_note' => 'Estimates may overlap where submitted reports describe the same ground.',
        ];
    }

    /**
     * Open validation work per assignee for load balancing only (C7).
     * Scoped by the shared Needs Visit queue definition so the workload
     * always opens the same records as the queue. Ordered alphabetically by
     * name — never ranked — with unassigned as its own final bucket.
     *
     * @return array{assignees: array<int, array{assignee_id: int, name: string, open_reports: int}>, unassigned: int}
     */
    private function validationWorkload(Builder $base): array
    {
        $reports = $this->applyOperationalQueueFilter
            ->handle(clone $base, Report::QUEUE_NEEDS_VISIT)
            ->with(['fieldValidationAssignment.assignee:id,name'])
            ->get(['reports.id']);

        $byAssignee = [];
        $unassigned = 0;
        foreach ($reports as $report) {
            $assignment = $report->fieldValidationAssignment;
            if ($assignment && $assignment->assignee_id) {
                $id = (int) $assignment->assignee_id;
                $byAssignee[$id] ??= [
                    'assignee_id' => $id,
                    'name' => $assignment->assignee?->name ?? 'Unknown assignee',
                    'open_reports' => 0,
                ];
                $byAssignee[$id]['open_reports']++;
            } else {
                $unassigned++;
            }
        }
        $assignees = array_values($byAssignee);
        usort($assignees, static fn (array $a, array $b): int => strcmp((string) $a['name'], (string) $b['name']));

        return ['assignees' => $assignees, 'unassigned' => $unassigned];
    }

    /**
     * Open, incomplete validation work against its recorded target date
     * (C8). Four buckets with unscheduled always visible, compared in PHT —
     * the chart rule — and labelled past-target, never overdue.
     *
     * @return array{unscheduled: int, scheduled: int, due_today: int, past_target_date: int, today: string}
     */
    private function validationSchedule(Builder $base): array
    {
        $today = CarbonImmutable::now(self::TIMEZONE)->toDateString();
        $buckets = [
            'unscheduled' => 0,
            'scheduled' => 0,
            'due_today' => 0,
            'past_target_date' => 0,
        ];

        $reports = (clone $base)
            ->where('case_state', Report::CASE_STATE_OPEN)
            ->where('field_validation_state', '!=', Report::FIELD_VALIDATION_STATE_COMPLETED)
            ->with(['fieldValidationAssignment:id,report_id,target_visit_date'])
            ->get(['reports.id']);

        foreach ($reports as $report) {
            $target = $report->fieldValidationAssignment?->target_visit_date?->toDateString();
            if ($target === null) {
                $buckets['unscheduled']++;
            } elseif ($target < $today) {
                $buckets['past_target_date']++;
            } elseif ($target === $today) {
                $buckets['due_today']++;
            } else {
                $buckets['scheduled']++;
            }
        }

        return [...$buckets, 'today' => $today];
    }

    /**
     * Review backlog by waiting age over the needs-review predicate (C9):
     * open submitted reports with no verification outcome yet. Buckets are
     * labelled waiting age, never overdue; the oldest wait travels beside
     * the histogram.
     *
     * @return array{total_waiting: int, buckets: array<int, array{label: string, count: int}>, oldest_waiting_days: int|null}
     */
    private function reviewBacklog(Builder $base): array
    {
        $now = CarbonImmutable::now(self::TIMEZONE);
        $buckets = [
            ['label' => '0–2 days waiting', 'min' => 0, 'max' => 2, 'count' => 0],
            ['label' => '3–6 days waiting', 'min' => 3, 'max' => 6, 'count' => 0],
            ['label' => '7–13 days waiting', 'min' => 7, 'max' => 13, 'count' => 0],
            ['label' => '14–29 days waiting', 'min' => 14, 'max' => 29, 'count' => 0],
            ['label' => '30+ days waiting', 'min' => 30, 'max' => null, 'count' => 0],
        ];

        $reports = (clone $base)
            ->where('case_state', Report::CASE_STATE_OPEN)
            ->where('verification_outcome', Report::VERIFICATION_OUTCOME_NOT_DETERMINED)
            ->get(['submitted_at']);

        $oldest = null;
        foreach ($reports as $report) {
            if (! $report->submitted_at) {
                continue;
            }
            $waiting = max(0, (int) $report->submitted_at->diffInDays($now));
            $oldest = $oldest === null ? $waiting : max($oldest, $waiting);
            foreach ($buckets as &$bucket) {
                if ($waiting >= $bucket['min'] && ($bucket['max'] === null || $waiting <= $bucket['max'])) {
                    $bucket['count']++;
                    break;
                }
            }
            unset($bucket);
        }

        return [
            'total_waiting' => $reports->count(),
            'buckets' => array_map(
                static fn (array $bucket): array => ['label' => $bucket['label'], 'count' => $bucket['count']],
                $buckets,
            ),
            'oldest_waiting_days' => $oldest,
        ];
    }

    /**
     * Measured field-validation turnaround from assignment activation to
     * the completion visit (C12). Descriptive durations only: non-negative
     * intervals, no target comparison, no ranking.
     *
     * @return array<string, mixed>
     */
    private function validationTurnaround(Builder $base): array
    {
        $durations = [];
        $reports = (clone $base)
            ->whereHas(
                'fieldValidationAssignment.completion',
                static fn (Builder $completion) => $completion->whereNotNull('visited_at'),
            )
            ->with(['fieldValidationAssignment:id,report_id,activated_at', 'fieldValidationAssignment.completion:assignment_id,visited_at'])
            ->get(['reports.id']);

        foreach ($reports as $report) {
            $assignment = $report->fieldValidationAssignment;
            $visitedAt = $assignment?->completion?->visited_at;
            $activatedAt = $assignment?->activated_at;
            if ($activatedAt === null || $visitedAt === null || $visitedAt->lt($activatedAt)) {
                continue;
            }
            $durations[] = round($activatedAt->diffInSeconds($visitedAt) / 3600, 2);
        }

        $buckets = [
            ['label' => 'Under 24 hours', 'count' => 0],
            ['label' => '1–3 days', 'count' => 0],
            ['label' => '3–7 days', 'count' => 0],
            ['label' => 'Over 7 days', 'count' => 0],
        ];
        foreach ($durations as $hours) {
            $buckets[$hours < 24 ? 0 : ($hours <= 72 ? 1 : ($hours <= 168 ? 2 : 3))]['count']++;
        }

        if ($durations === []) {
            return [
                'source' => 'activated_at_to_visited_at',
                'completed' => 0,
                'average_hours' => null,
                'median_hours' => null,
                'min_hours' => null,
                'max_hours' => null,
                'buckets' => $buckets,
            ];
        }

        sort($durations, SORT_NUMERIC);
        $count = count($durations);
        $middle = intdiv($count, 2);
        $median = $count % 2 === 0
            ? ($durations[$middle - 1] + $durations[$middle]) / 2
            : $durations[$middle];

        return [
            'source' => 'activated_at_to_visited_at',
            'completed' => $count,
            'average_hours' => round(array_sum($durations) / $count, 2),
            'median_hours' => round($median, 2),
            'min_hours' => $durations[0],
            'max_hours' => $durations[$count - 1],
            'buckets' => $buckets,
        ];
    }

    private function label(CarbonImmutable $start, CarbonImmutable $end, int $days): string
    {
        $last = $end->subDay();

        return $start->year === $last->year
            ? $start->format('j F').' – '.$last->format('j F Y').' ('.$days.' days)'
            : $start->format('j F Y').' – '.$last->format('j F Y').' ('.$days.' days)';
    }

    private function isPartial(CarbonImmutable $end): bool
    {
        return CarbonImmutable::now(self::TIMEZONE)->lessThan($end);
    }

    private function invalid(string $key, string $message): ValidationException
    {
        return ValidationException::withMessages([$key => $message]);
    }
}
