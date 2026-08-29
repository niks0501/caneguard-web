<?php

use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\V1\AuthenticatedUserController;
use App\Http\Controllers\Api\V1\DashboardSummaryController;
use App\Http\Controllers\Api\V1\FieldReporterController;
use App\Http\Controllers\Api\V1\FieldValidationQueueController;
use App\Http\Controllers\Api\V1\LinkDuplicateReportController;
use App\Http\Controllers\Api\V1\LocationReferenceController;
use App\Http\Controllers\Api\V1\MapReportController;
use App\Http\Controllers\Api\V1\MobileAuthController;
use App\Http\Controllers\Api\V1\MobileFieldValidationAssignmentController;
use App\Http\Controllers\Api\V1\MobileFieldValidationCompletionController;
use App\Http\Controllers\Api\V1\MobileNotificationController;
use App\Http\Controllers\Api\V1\MobilePossibleRecentMatchesController;
use App\Http\Controllers\Api\V1\MobileReportController;
use App\Http\Controllers\Api\V1\MobileReportStatusController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\ReportImageController;
use App\Http\Controllers\Api\V1\ReportPossibleMatchesController;
use App\Http\Controllers\Api\V1\ReviewReportController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::post('/v1/mobile/auth/login', [MobileAuthController::class, 'login'])
    ->middleware('throttle:login');
Route::get('/v1/reference/locations', LocationReferenceController::class);

Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    Route::get('/me', AuthenticatedUserController::class);
    Route::get('/dashboard/summary', DashboardSummaryController::class);
    Route::get('/field-reporters', FieldReporterController::class);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::patch('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::get('/reports', [ReportController::class, 'index']);
    Route::get('/reports/map', MapReportController::class)
        ->name('api.v1.reports.map');
    Route::get('/reports/field-validation-queue', FieldValidationQueueController::class)
        ->name('api.v1.reports.field-validation-queue');
    Route::get('/reports/{report}/image', ReportImageController::class)
        ->name('api.v1.reports.image');
    Route::get('/reports/{report}/possible-matches', ReportPossibleMatchesController::class)
        ->name('api.v1.reports.possible-matches');
    Route::get('/reports/{report}', [ReportController::class, 'show']);
    Route::patch('/reports/{report}/review', ReviewReportController::class);
    Route::post('/reports/{report}/duplicate-link', LinkDuplicateReportController::class)
        ->name('api.v1.reports.duplicate-link');

    Route::get('/mobile/auth/me', [MobileAuthController::class, 'me']);
    Route::delete('/mobile/auth/logout', [MobileAuthController::class, 'logout']);

    Route::get('/mobile/reports/possible-matches', MobilePossibleRecentMatchesController::class)
        ->middleware('abilities:report:submit')
        ->name('api.v1.mobile.reports.possible-matches');
    Route::post('/mobile/reports', [MobileReportController::class, 'store'])
        ->middleware(['abilities:report:submit', 'throttle:30,1']);
    Route::get('/mobile/reports/statuses', MobileReportStatusController::class)
        ->middleware('abilities:report:status');
    Route::get('/mobile/assignments', MobileFieldValidationAssignmentController::class)
        ->middleware('abilities:assignment:read');
    Route::get('/mobile/notifications', MobileNotificationController::class)
        ->middleware('abilities:notification:read');
    Route::post('/mobile/assignments/{assignment}/completion', MobileFieldValidationCompletionController::class)
        ->middleware(['abilities:assignment:complete', 'throttle:30,1']);
});
