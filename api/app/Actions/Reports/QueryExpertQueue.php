<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class QueryExpertQueue
{
    public function __construct(
        private readonly ApplyReportFilters $applyReportFilters,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator<int, Report>
     */
    public function handle(User $expert, array $filters): LengthAwarePaginator
    {
        $query = Report::query()->with([
            'reporter',
            'reviewer',
            'fieldValidationAssignment',
            'referral',
        ]);

        $query->whereHas('referrals', function (Builder $query) use ($expert): void {
            $query
                ->where('expert_id', $expert->getKey())
                ->whereIn('consult_status', ReportReferral::activeStatuses());
        });
        $this->applyReportFilters->handle($query, $filters, 'submitted_at');

        $ascending = ($filters['sort'] ?? '-submitted_at') === 'submitted_at';

        return $query
            ->orderBy('submitted_at', $ascending ? 'asc' : 'desc')
            ->orderBy('id', $ascending ? 'asc' : 'desc')
            ->paginate((int) ($filters['per_page'] ?? 15))
            ->withQueryString();
    }
}
