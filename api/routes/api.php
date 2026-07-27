<?php

use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\V1\AuthenticatedUserController;
use App\Http\Controllers\Api\V1\DashboardSummaryController;
use App\Http\Controllers\Api\V1\MobileAuthController;
use App\Http\Controllers\Api\V1\MobileReportController;
use App\Http\Controllers\Api\V1\MobileReportStatusController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\ReportImageController;
use App\Http\Controllers\Api\V1\ReviewReportController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::post('/v1/mobile/auth/login', [MobileAuthController::class, 'login'])
    ->middleware('throttle:login');

Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    Route::get('/me', AuthenticatedUserController::class);
    Route::get('/dashboard/summary', DashboardSummaryController::class);
    Route::get('/reports', [ReportController::class, 'index']);
    Route::get('/reports/{report}/image', ReportImageController::class)
        ->name('api.v1.reports.image');
    Route::get('/reports/{report}', [ReportController::class, 'show']);
    Route::patch('/reports/{report}/review', ReviewReportController::class);

    Route::get('/mobile/auth/me', [MobileAuthController::class, 'me']);
    Route::delete('/mobile/auth/logout', [MobileAuthController::class, 'logout']);

    Route::post('/mobile/reports', [MobileReportController::class, 'store'])
        ->middleware(['abilities:report:submit', 'throttle:30,1']);
    Route::get('/mobile/reports/statuses', MobileReportStatusController::class)
        ->middleware('abilities:report:status');
});
