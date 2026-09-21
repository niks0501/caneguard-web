<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\ApplyOperationalQueueFilter;
use App\Actions\Reports\BuildMonthlyReportSummary;
use App\Actions\Reports\CalibrateReportTriage;
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
        BuildMonthlyReportSummary $buildMonthlyReportSummary,
        CalibrateReportTriage $calibrateReportTriage,
    ): JsonResponse {
        $counts = array_fill_keys(Report::reviewStatuses(), 0);

        Report::query()
            ->whereNull('canonical_report_id')
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
            ->whereNull('canonical_report_id')
            ->with(['reporter', 'reviewer', 'fieldValidationAssignment', 'qualityWarnings'])
            ->latest('submitted_at')
            ->limit(5)
            ->get();

        $riskCalibration = $calibrateReportTriage->handle();
        $riskBands = array_fill_keys(['green', 'amber', 'red'], 0);
        if ($riskCalibration['enabled']) {
            $applyOperationalQueueFilter
                ->handle(
                    Report::query()->with('qualityWarnings'),
                    Report::QUEUE_NEEDS_REVIEW,
                )
                ->get()
                ->each(function (Report $report) use (&$riskBands, $calibrateReportTriage, $riskCalibration): void {
                    $band = $calibrateReportTriage->classify($report, $riskCalibration)['band'];
                    if ($band !== null) {
                        $riskBands[$band] += 1;
                    }
                });
        }

        return response()->json([
            'data' => [
                'counts' => [
                    'total_submitted' => array_sum($counts),
                    ...$counts,
                ],
                'queues' => $queueCounts,
                'risk_triage' => [
                    ...$riskCalibration,
                    'bands' => $riskBands,
                ],
                'recent_reports' => ReportListResource::collection($recentReports)
                    ->resolve($request),
                'monthly_summary' => $buildMonthlyReportSummary->handle(
                    $request->validated()['month'] ?? null,
                ),
            ],
        ]);
    }
}
