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
    /**
     * Payload split (dashboard overhaul P1): `?include=` selects the slices
     * after the always-present counts. The default (counts, queues, recent)
     * is what the dashboard needs for first paint; `monthly` rides with the
     * chart requests and `risk` keeps the calibration reachable without
     * paying for it on every load. `recent_limit` defaults to the 10-row
     * recent table and never reaches the register endpoint's 100-row cap.
     */
    public function __invoke(
        DashboardSummaryRequest $request,
        ApplyOperationalQueueFilter $applyOperationalQueueFilter,
        BuildMonthlyReportSummary $buildMonthlyReportSummary,
        CalibrateReportTriage $calibrateReportTriage,
    ): JsonResponse {
        $validated = $request->validated();
        $requested = array_values(array_filter(array_map(
            trim(...),
            explode(',', (string) ($validated['include'] ?? '')),
        )));
        $include = $requested === []
            ? ['queues', 'recent']
            : array_values(array_intersect(
                $requested,
                ['queues', 'recent', 'monthly', 'risk'],
            ));
        $recentLimit = min(25, max(1, (int) ($validated['recent_limit'] ?? 10)));

        $counts = array_fill_keys(Report::reviewStatuses(), 0);

        Report::query()->visibleTo(request()->user())
            ->whereNull('canonical_report_id')
            ->selectRaw('review_status, COUNT(*) AS aggregate')
            ->groupBy('review_status')
            ->pluck('aggregate', 'review_status')
            ->each(function (int $count, string $status) use (&$counts) {
                $counts[$status] = $count;
            });

        $data = [
            'counts' => [
                'total_submitted' => array_sum($counts),
                ...$counts,
            ],
        ];

        if (in_array('queues', $include, true)) {
            $queueCounts = [];
            foreach (Report::operationalQueues() as $queue) {
                $queueCounts[$queue] = $applyOperationalQueueFilter
                    ->handle(Report::query()->visibleTo(request()->user()), $queue)
                    ->count('reports.id');
            }
            $data['queues'] = $queueCounts;
        }

        if (in_array('recent', $include, true)) {
            $recentReports = Report::query()->visibleTo(request()->user())
                ->whereNull('canonical_report_id')
                ->with(['reporter', 'reviewer', 'fieldValidationAssignment', 'qualityWarnings'])
                ->latest('submitted_at')
                ->limit($recentLimit)
                ->get();
            $data['recent_reports'] = ReportListResource::collection($recentReports)
                ->resolve($request);
        }

        if (in_array('risk', $include, true)) {
            $riskCalibration = $calibrateReportTriage->handle();
            $riskBands = array_fill_keys(['green', 'amber', 'red'], 0);
            if ($riskCalibration['enabled']) {
                $applyOperationalQueueFilter
                    ->handle(
                        Report::query()->visibleTo(request()->user())->withCount('qualityWarnings'),
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
            $data['risk_triage'] = [
                ...$riskCalibration,
                'bands' => $riskBands,
            ];
        }

        if (in_array('monthly', $include, true)) {
            $data['monthly_summary'] = $buildMonthlyReportSummary->handle(
                $validated['month'] ?? null,
            );
        }

        return response()->json(['data' => $data]);
    }
}
