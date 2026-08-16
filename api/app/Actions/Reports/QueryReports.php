<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class QueryReports
{
    public function __construct(
        private readonly ApplyReportFilters $applyReportFilters,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator<int, Report>
     */
    public function handle(array $filters): LengthAwarePaginator
    {
        $query = Report::query()->with(['reporter', 'reviewer']);
        $this->applyReportFilters->handle($query, $filters, 'submitted_at');

        [$column, $direction] = match ($filters['sort'] ?? '-submitted_at') {
            'submitted_at' => ['submitted_at', 'asc'],
            '-confidence' => ['confidence', 'desc'],
            'confidence' => ['confidence', 'asc'],
            default => ['submitted_at', 'desc'],
        };

        return $query
            ->orderBy($column, $direction)
            ->orderBy('id')
            ->paginate((int) ($filters['per_page'] ?? 15))
            ->withQueryString();
    }
}
