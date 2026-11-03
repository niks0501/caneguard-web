<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Per-condition and per-barangay trends for the Trends tab.
 *
 * Each window is read in a single grouped SQL pass over
 * (PHT day, staff classification, possible condition, barangay), so the
 * work scales with distinct combinations rather than with report rows.
 * Weekly buckets are folded from the grouped days using the same Monday
 * anchoring as BuildReportAnalytics::buckets(), and every report lands in
 * exactly one condition (or the unclassified remainder) per vocabulary, so
 * the condition series always sum to the overall series bucket by bucket.
 */
final class BuildConditionBarangayTrends
{
    /** A condition or barangay is rising when this period is at least this multiple of the previous one... */
    public const RISING_RATIO = 2;

    /** ...and this period holds at least this many cases. */
    public const RISING_MIN_CASES = 3;

    /** Number of barangays in the top-barangays table. */
    public const TOP_BARANGAYS = 5;

    /**
     * @return array{rising_rule: array{ratio: int, min_cases: int}, series_by_condition: array<string, mixed>, series_by_barangay: array<string, mixed>}
     */
    public function handle(
        Builder $current,
        Builder $previous,
        CarbonImmutable $start,
        CarbonImmutable $end,
        string $granularity,
    ): array {
        $labels = $this->bucketLabels($start, $end, $granularity);

        $currentRows = $this->grouped($current, true);
        $previousRows = $this->grouped($previous, false);

        $staffDeclared = Report::activeAuthorityClassifiedConditions();
        $aiDeclared = Report::v2Labels();

        return [
            'rising_rule' => [
                'ratio' => self::RISING_RATIO,
                'min_cases' => self::RISING_MIN_CASES,
            ],
            'series_by_condition' => [
                'staff_classification' => $this->byCondition(
                    $currentRows, $previousRows, 'authority', $staffDeclared, $labels, $start, $granularity,
                ),
                'possible_condition' => $this->byCondition(
                    $currentRows, $previousRows, 'predicted', $aiDeclared, $labels, $start, $granularity,
                ),
            ],
            'series_by_barangay' => $this->byBarangay($currentRows, $previousRows),
        ];
    }

    public static function isRising(int $current, int $previous): bool
    {
        return $current >= self::RISING_MIN_CASES && $current >= self::RISING_RATIO * $previous;
    }

    /**
     * One grouped pass. The day is the PHT calendar day; the previous window
     * does not need it, so it groups on the three dimensions only.
     *
     * @return array<int, array{day: string, authority: string, predicted: string, barangay: string, total: int}>
     */
    private function grouped(Builder $query, bool $withDay): array
    {
        $sqlite = $query->getConnection()->getDriverName() === 'sqlite';
        $day = $sqlite ? "date(submitted_at, '+8 hours')" : 'DATE(DATE_ADD(submitted_at, INTERVAL 8 HOUR))';

        $query->reorder()->select([
            'authority_classified_condition AS authority',
            'predicted_label AS predicted',
            'barangay',
        ])->selectRaw('COUNT(*) AS total');
        $groups = ['authority_classified_condition', 'predicted_label', 'barangay'];
        if ($withDay) {
            $query->selectRaw("$day AS day");
            $groups[] = 'day';
        }

        return $query->groupBy($groups)->toBase()->get()->map(static fn (object $row): array => [
            'day' => (string) ($row->day ?? ''),
            'authority' => (string) ($row->authority ?? ''),
            'predicted' => (string) ($row->predicted ?? ''),
            'barangay' => trim((string) ($row->barangay ?? '')),
            'total' => (int) $row->total,
        ])->all();
    }

    /**
     * @param  array<int, array<string, mixed>>  $currentRows
     * @param  array<int, array<string, mixed>>  $previousRows
     * @param  array<int, string>  $declared
     * @param  array<int, string>  $labels
     * @return array{conditions: array<int, array<string, mixed>>, unclassified: array<string, mixed>}
     */
    private function byCondition(
        array $currentRows,
        array $previousRows,
        string $dimension,
        array $declared,
        array $labels,
        CarbonImmutable $start,
        string $granularity,
    ): array {
        $buckets = array_fill_keys(array_merge($declared, ['']), array_fill_keys($labels, 0));
        $previousTotals = array_fill_keys(array_merge($declared, ['']), 0);

        foreach ($currentRows as $row) {
            $key = in_array($row[$dimension], $declared, true) ? $row[$dimension] : '';
            $buckets[$key][$this->bucketKey($row['day'], $granularity)] += $row['total'];
        }
        foreach ($previousRows as $row) {
            $key = in_array($row[$dimension], $declared, true) ? $row[$dimension] : '';
            $previousTotals[$key] += $row['total'];
        }

        $entry = static function (string $key, string $condition) use ($buckets, $previousTotals): array {
            $series = [];
            foreach ($buckets[$key] as $label => $count) {
                $series[] = ['label' => $label, 'count' => $count];
            }
            $total = array_sum($buckets[$key]);

            return [
                'condition' => $condition,
                'total' => $total,
                'previous_total' => $previousTotals[$key],
                'rising' => self::isRising($total, $previousTotals[$key]),
                'series' => $series,
            ];
        };

        return [
            'conditions' => array_map(static fn (string $condition): array => $entry($condition, $condition), $declared),
            'unclassified' => $entry('', 'unclassified'),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $currentRows
     * @param  array<int, array<string, mixed>>  $previousRows
     * @return array{top_n: int, rows: array<int, array<string, mixed>>}
     */
    private function byBarangay(array $currentRows, array $previousRows): array
    {
        $totals = [];
        foreach ($currentRows as $row) {
            if ($row['barangay'] !== '') {
                $totals[$row['barangay']]['current'] = ($totals[$row['barangay']]['current'] ?? 0) + $row['total'];
            }
        }
        foreach ($previousRows as $row) {
            if ($row['barangay'] !== '') {
                $totals[$row['barangay']]['previous'] = ($totals[$row['barangay']]['previous'] ?? 0) + $row['total'];
            }
        }

        $rows = [];
        foreach ($totals as $barangay => $count) {
            $now = $count['current'] ?? 0;
            $before = $count['previous'] ?? 0;
            if ($now === 0) {
                continue;
            }
            $rows[] = [
                'barangay' => (string) $barangay,
                'total' => $now,
                'previous_total' => $before,
                'delta' => $now - $before,
                'rising' => self::isRising($now, $before),
            ];
        }
        usort($rows, static fn (array $a, array $b): int => $b['total'] <=> $a['total']
            ?: $b['previous_total'] <=> $a['previous_total']
            ?: strcmp($a['barangay'], $b['barangay']));

        return ['top_n' => self::TOP_BARANGAYS, 'rows' => array_slice($rows, 0, self::TOP_BARANGAYS)];
    }

    /** @return array<int, string> */
    private function bucketLabels(CarbonImmutable $start, CarbonImmutable $end, string $granularity): array
    {
        $labels = [];
        $cursor = $granularity === 'week' ? $start->startOfWeek(CarbonImmutable::MONDAY) : $start;
        while ($cursor->lessThan($end)) {
            $labels[] = $cursor->toDateString();
            $cursor = $granularity === 'week' ? $cursor->addWeek() : $cursor->addDay();
        }

        return $labels;
    }

    private function bucketKey(string $day, string $granularity): string
    {
        if ($granularity !== 'week') {
            return $day;
        }

        return CarbonImmutable::createFromFormat('!Y-m-d', $day, BuildReportAnalytics::TIMEZONE)
            ->startOfWeek(CarbonImmutable::MONDAY)->toDateString();
    }
}
