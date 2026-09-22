<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

/**
 * Builds the period-aware, self-describing report payload used by both the
 * HTML document preview and the PDF renderer. Document periods use PHT by
 * decision; the existing dashboard monthly summary remains UTC-based.
 */
final class BuildReportDocument
{
    public const TIMEZONE = 'Asia/Manila';

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
        $period = $this->resolvePeriod($input);
        $filters = $this->filters($input);
        $query = Report::query()
            ->whereNull('canonical_report_id')
            ->where('submitted_at', '>=', $period['start']->utc())
            ->where('submitted_at', '<', $period['end']->utc());

        $this->applyReportFilters->handle($query, $filters);
        if (isset($filters['queue'])) {
            $this->applyOperationalQueueFilter->handle($query, $filters['queue']);
        }

        $metrics = $this->buildMonthlyReportSummary->buildFromQuery(
            $query,
            $period['type'] === 'monthly' ? $period['start']->format('Y-m') : null,
            [
                'from' => $period['start']->toDateString(),
                'to' => $period['end']->subDay()->toDateString(),
            ],
        );

        $reports = $input['appendix'] ?? false
            ? $this->appendix($query)
            : [];

        return [
            'period' => [
                'type' => $period['type'],
                'from' => $period['start']->toDateString(),
                'to' => $period['end']->subDay()->toDateString(),
                'from_instant' => $period['start']->utc()->toIso8601String(),
                'to_instant' => $period['end']->utc()->toIso8601String(),
                'label' => $period['label'],
                'timezone' => self::TIMEZONE,
                'timezone_label' => 'PHT (UTC+8)',
                'partial' => $period['partial'],
                'days' => $period['start']->diffInDays($period['end']),
            ],
            'filters' => $filters,
            'filter_summary' => $this->filterSummary($filters),
            'generated_at' => now(self::TIMEZONE)->format('j F Y H:i').' PHT',
            'generated_by' => auth()->user()?->name ?? 'CaneGuard office',
            'metrics' => $metrics,
            'trend' => $this->trend($query, $period),
            'operational_queues' => $this->operationalQueues($query),
            'appendix_enabled' => (bool) ($input['appendix'] ?? false),
            'appendix_warning' => (bool) ($input['appendix'] ?? false)
                ? 'Farmer and farm references are included in this document.'
                : null,
            'appendix' => $reports,
            'appendix_capped' => count($reports) >= 1000,
        ];
    }

    /**
     * Resolve a period in Asia/Manila. Returns UTC-ready Carbon instances for
     * database comparisons while retaining the local dates for the document.
     *
     * @param  array<string, mixed>  $input
     * @return array{type:string,start:CarbonImmutable,end:CarbonImmutable,label:string,partial:bool}
     */
    public function resolvePeriod(array $input): array
    {
        $timezone = self::TIMEZONE;
        $now = CarbonImmutable::now($timezone);
        $type = (string) ($input['period_type'] ?? $input['type'] ?? 'weekly');

        if ($type === 'weekly') {
            if (isset($input['week']) && is_string($input['week'])
                && preg_match('/^(\d{4})-W(\d{2})$/', $input['week'], $matches)) {
                $start = $now->setISODate((int) $matches[1], (int) $matches[2], 1)->startOfDay();
                if ($start->format('o-\\WW') !== $input['week']) {
                    throw $this->invalid('week', 'The selected week is not a valid ISO week.');
                }
            } else {
                $start = $now->startOfWeek(CarbonImmutable::MONDAY)->subWeek();
            }
            $end = $start->addWeek();
            $label = 'Week '.$start->isoWeek().' · '.$start->format('j').'–'.$end->subDay()->format('j F Y');
        } elseif ($type === 'monthly') {
            if (isset($input['month']) && is_string($input['month'])) {
                try {
                    $start = CarbonImmutable::createFromFormat('!Y-m', $input['month'], $timezone);
                } catch (\Throwable) {
                    $start = null;
                }
                if (! $start || $start->format('Y-m') !== $input['month']) {
                    throw $this->invalid('month', 'The month must use YYYY-MM format.');
                }
            } else {
                $start = $now->startOfMonth()->subMonth();
            }
            $end = $start->addMonth();
            $label = $start->format('F Y');
        } elseif ($type === 'custom') {
            $from = (string) ($input['from'] ?? '');
            $to = (string) ($input['to'] ?? '');
            try {
                $start = CarbonImmutable::createFromFormat('!Y-m-d', $from, $timezone)->startOfDay();
                $end = CarbonImmutable::createFromFormat('!Y-m-d', $to, $timezone)->addDay()->startOfDay();
            } catch (\Throwable) {
                throw $this->invalid('from', 'A valid custom from and to date are required.');
            }
            if ($end->lessThanOrEqualTo($start)) {
                throw $this->invalid('to', 'The custom range must end on or after its start date.');
            }
            if ($start->diffInDays($end) > 366) {
                throw $this->invalid('to', 'Custom ranges cannot exceed 366 days.');
            }
            $label = $start->year === $end->subDay()->year
                ? $start->format('j F').' – '.$end->subDay()->format('j F Y').' ('.$start->diffInDays($end).' days)'
                : $start->format('j F Y').' – '.$end->subDay()->format('j F Y').' ('.$start->diffInDays($end).' days)';
        } else {
            throw $this->invalid('period_type', 'The period type must be weekly, monthly, or custom.');
        }

        $partial = $now->greaterThanOrEqualTo($start) && $now->lessThan($end);

        return compact('type', 'start', 'end', 'label', 'partial');
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    private function filters(array $input): array
    {
        $keys = [
            'search', 'status', 'case_state', 'verification_outcome',
            'field_validation_state', 'authority_classified_condition',
            'concern', 'follow_up_outcome', 'referral', 'predicted_label',
            'barangay', 'queue',
        ];

        return array_filter(
            array_intersect_key($input, array_flip($keys)),
            static fn (mixed $value): bool => $value !== null && $value !== '',
        );
    }

    /** @param array<string, mixed> $filters */
    private function filterSummary(array $filters): string
    {
        if ($filters === []) {
            return 'All submitted reports';
        }

        return collect($filters)->map(static fn (mixed $value, string $key): string => str_replace('_', ' ', $key).': '.(is_scalar($value) ? (string) $value : 'selected')
        )->implode(' · ');
    }

    /**
     * @param  array{type:string,start:CarbonImmutable,end:CarbonImmutable,label:string,partial:bool}  $period
     * @return array<int, array{label:string,count:int}>
     */
    private function trend(Builder $query, array $period): array
    {
        $weekly = $period['type'] !== 'weekly';
        $counts = [];
        foreach ((clone $query)->get(['submitted_at']) as $report) {
            if (! $report->submitted_at) {
                continue;
            }
            $date = $report->submitted_at->timezone(self::TIMEZONE);
            $key = $weekly
                ? $date->startOfWeek(CarbonImmutable::MONDAY)->toDateString()
                : $date->toDateString();
            $counts[$key] = ($counts[$key] ?? 0) + 1;
        }
        ksort($counts);

        return collect($counts)->map(fn (int $count, string $label): array => [
            'label' => $label,
            'count' => $count,
        ])->values()->all();
    }

    /** @return array<string, int> */
    private function operationalQueues(Builder $query): array
    {
        $queues = [];
        foreach (Report::operationalQueues() as $queue) {
            $queues[$queue] = (clone $query)->whereNull('canonical_report_id')->tap(
                fn (Builder $scoped) => $this->applyOperationalQueueFilter->handle($scoped, $queue),
            )->count('reports.id');
        }

        return $queues;
    }

    /** @return array<int, array<string, mixed>> */
    private function appendix(Builder $query): array
    {
        return (clone $query)
            ->with(['reporter', 'fieldValidationAssignment.assignee', 'referral'])
            ->orderBy('submitted_at')
            ->limit(1000)
            ->get()
            ->map(static fn (Report $report): array => [
                'case_reference' => $report->reference_code,
                'submitted_date' => $report->submitted_at?->timezone(self::TIMEZONE)->toDateString(),
                'barangay' => $report->barangay,
                'farmer_or_farm_reference' => $report->farmer_or_farm_owner_name,
                'possible_ai_condition' => $report->predicted_label,
                'affected_area_hectares' => $report->affected_area_hectares,
                'work_status' => $report->review_status,
                'verification_outcome' => $report->verification_outcome,
                'case_state' => $report->case_state,
                'field_validation_state' => $report->field_validation_state,
                'staff_classified_condition' => $report->authority_classified_condition,
            ])->all();
    }

    private function invalid(string $key, string $message): ValidationException
    {
        return ValidationException::withMessages([$key => $message]);
    }
}
