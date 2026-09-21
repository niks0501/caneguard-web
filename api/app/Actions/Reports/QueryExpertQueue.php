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
        $query = Report::query()
            ->whereNull('canonical_report_id')
            ->with([
                'reporter',
                'reviewer',
                'fieldValidationAssignment',
                'referral.expert',
            ]);

        $query->whereHas('referrals', function (Builder $query) use ($expert): void {
            $query
                ->where('expert_id', $expert->getKey())
                ->whereIn('consult_status', ReportReferral::activeStatuses());
        });
        $this->applyReportFilters->handle($query, $filters, 'submitted_at');

        if (($filters['sort'] ?? '-submitted_at') === 'due_soonest') {
            $query
                ->orderByRaw('(select due_date from report_referrals where report_referrals.report_id = reports.id and report_referrals.expert_id = ? and report_referrals.consult_status in (?, ?) order by due_date is null, due_date, id limit 1) is null', [
                    $expert->getKey(),
                    ReportReferral::STATUS_PENDING,
                    ReportReferral::STATUS_IN_PROGRESS,
                ])
                ->orderByRaw('(select due_date from report_referrals where report_referrals.report_id = reports.id and report_referrals.expert_id = ? and report_referrals.consult_status in (?, ?) order by due_date is null, due_date, id limit 1)', [
                    $expert->getKey(),
                    ReportReferral::STATUS_PENDING,
                    ReportReferral::STATUS_IN_PROGRESS,
                ])
                ->orderBy('submitted_at')
                ->orderBy('id');
        } else {
            $ascending = ($filters['sort'] ?? '-submitted_at') === 'submitted_at';
            $query
                ->orderBy('submitted_at', $ascending ? 'asc' : 'desc')
                ->orderBy('id', $ascending ? 'asc' : 'desc');
        }

        return $query
            ->paginate((int) ($filters['per_page'] ?? 15))
            ->withQueryString();
    }
}
