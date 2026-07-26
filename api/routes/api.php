<?php

use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\V1\AuthenticatedUserController;
use App\Http\Controllers\Api\V1\DashboardSummaryController;
use App\Http\Controllers\Api\V1\MobileReportController;
use App\Http\Controllers\Api\V1\MobileReportStatusController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\ReportImageController;
use App\Http\Controllers\Api\V1\ReviewReportController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    Route::get('/me', AuthenticatedUserController::class);
    Route::get('/dashboard/summary', DashboardSummaryController::class);
    Route::get('/reports', [ReportController::class, 'index']);
    Route::get('/reports/{report}/image', ReportImageController::class)
        ->name('api.v1.reports.image');
    Route::get('/reports/{report}', [ReportController::class, 'show']);
    Route::patch('/reports/{report}/review', ReviewReportController::class);

    Route::post('/mobile/reports', [MobileReportController::class, 'store'])
        ->middleware('throttle:30,1');
    Route::get('/mobile/reports/statuses', MobileReportStatusController::class);
});
