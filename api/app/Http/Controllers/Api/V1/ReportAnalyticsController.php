<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildReportAnalytics;
use App\Http\Controllers\Controller;
use App\Http\Requests\ReportAnalyticsRequest;
use Illuminate\Http\JsonResponse;

class ReportAnalyticsController extends Controller
{
    public function __invoke(
        ReportAnalyticsRequest $request,
        BuildReportAnalytics $buildReportAnalytics,
    ): JsonResponse {
        return response()->json([
            'data' => $buildReportAnalytics->handle($request->validated()),
        ])->header('Cache-Control', 'no-store, private');
    }
}
