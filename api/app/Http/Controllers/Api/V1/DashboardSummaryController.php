<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\ApplyOperationalQueueFilter;
use App\Http\Controllers\Controller;
use App\Http\Requests\DashboardSummaryRequest;
use App\Http\Resources\ReportListResource;
use App\Models\Report;
use Illuminate\Http\JsonResponse;

class DashboardSummaryController extends Controller
{
    public function __invoke(
        DashboardSummaryRequest $request,
        ApplyOperationalQueueFilter $applyOperationalQueueFilter,
    ): JsonResponse {
        $counts = array_fill_keys(Report::reviewStatuses(), 0);

        Report::query()
            ->selectRaw('review_status, COUNT(*) AS aggregate')
            ->groupBy('review_status')
            ->pluck('aggregate', 'review_status')
            ->each(function (int $count, string $status) use (&$counts) {
                $counts[$status] = $count;
            });

        $queueCounts = [];
        foreach (Report::operationalQueues() as $queue) {
            $queueCounts[$queue] = $applyOperationalQueueFilter
                ->handle(Report::query(), $queue)
                ->count('reports.id');
        }

        $recentReports = Report::query()
            ->with(['reporter', 'reviewer'])
            ->latest('submitted_at')
            ->limit(5)
            ->get();

        return response()->json([
            'data' => [
                'counts' => [
                    'total_submitted' => array_sum($counts),
                    ...$counts,
                ],
                'queues' => $queueCounts,
                'recent_reports' => ReportListResource::collection($recentReports)
                    ->resolve($request),
            ],
        ]);
    }
}
