<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

/**
 * Period trend and composition analytics (charts plan Phase 1: C1–C4, C11).
 *
 * Extends the documents track's Phase 0 period groundwork instead of
 * rebuilding it: PHT (Asia/Manila) boundaries, weekly/monthly/custom
 * resolution via from/to dates, and the 366-day range cap. The monthly
 * builder is reused untouched through its buildFromQuery seam so the shipped
 * UTC monthly summary stays byte-identical; only the new buckets, the
 * open/closed split and the previous-window comparison live here.
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
            'filters' => $filters,
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
