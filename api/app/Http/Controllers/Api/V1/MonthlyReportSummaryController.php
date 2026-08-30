<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildMonthlyReportSummary;
use App\Http\Controllers\Controller;
use App\Http\Requests\MonthlyReportSummaryRequest;
use Illuminate\Http\JsonResponse;

class MonthlyReportSummaryController extends Controller
{
    public function __invoke(
        MonthlyReportSummaryRequest $request,
        BuildMonthlyReportSummary $buildMonthlyReportSummary,
    ): JsonResponse {
        return response()->json([
            'data' => $buildMonthlyReportSummary->handle(
                $request->validated()['month'] ?? null,
            ),
        ])->header('Cache-Control', 'no-store, private');
    }
}
