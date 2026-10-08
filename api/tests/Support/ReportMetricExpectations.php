<?php

namespace Tests\Support;

use Illuminate\Support\Collection;

final class ReportMetricExpectations
{
    public static function groupedCounts(Collection $reports, string $field, string $key): array
    {
        $counts = [];
        foreach ($reports as $report) {
            $value = $report->getAttribute($field);
            $groupKey = $value ?? '';
            $counts[$groupKey] = ($counts[$groupKey] ?? 0) + 1;
        }

        $groups = [];
        foreach ($counts as $value => $count) {
            $groups[] = [$key => $value === '' ? null : $value, 'reported_cases' => $count];
        }
        usort($groups, fn (array $left, array $right): int =>
            ($right['reported_cases'] <=> $left['reported_cases'])
            ?: strcmp((string) $left[$key], (string) $right[$key])
        );

        return $groups;
    }
}
