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
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator<int, Report>
     */
    public function handle(array $filters): LengthAwarePaginator
    {
        $query = Report::query()->with([
            'reporter',
            'reviewer',
            'fieldValidationAssignment',
        ]);
        $this->applyReportFilters->handle($query, $filters, 'submitted_at');
        if (isset($filters['queue'])) {
            $this->applyOperationalQueueFilter->handle($query, $filters['queue']);
        }

        $this->applySort($query, (string) ($filters['sort'] ?? '-submitted_at'));

        return $query
            ->paginate((int) ($filters['per_page'] ?? 15))
            ->withQueryString();
    }

    /**
     * Operational order for a work queue. The web workspace opens on the oldest
     * submission first, and the due view orders by the active target visit date
     * without issuing one query per row.
     */
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
}
