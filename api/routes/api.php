<?php

use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\V1\AdminUserRoleController;
use App\Http\Controllers\Api\V1\AdvisoryController;
use App\Http\Controllers\Api\V1\AuthenticatedUserController;
use App\Http\Controllers\Api\V1\ConfirmExpertReferralController;
use App\Http\Controllers\Api\V1\DashboardSummaryController;
use App\Http\Controllers\Api\V1\ExpertConsultController;
use App\Http\Controllers\Api\V1\ExpertDirectoryController;
use App\Http\Controllers\Api\V1\ExpertQueueController;
use App\Http\Controllers\Api\V1\ExpertReferralFindingController;
use App\Http\Controllers\Api\V1\ExpertReferralResponseController;
use App\Http\Controllers\Api\V1\FieldReporterController;
use App\Http\Controllers\Api\V1\FieldValidationPhotoController;
use App\Http\Controllers\Api\V1\FieldValidationQueueController;
use App\Http\Controllers\Api\V1\LinkDuplicateReportController;
use App\Http\Controllers\Api\V1\LocationReferenceController;
use App\Http\Controllers\Api\V1\MapReportController;
use App\Http\Controllers\Api\V1\MobileAuthController;
use App\Http\Controllers\Api\V1\MobileFieldValidationAssignmentController;
use App\Http\Controllers\Api\V1\MobileFieldValidationCompletionController;
use App\Http\Controllers\Api\V1\MobileMapTileController;
use App\Http\Controllers\Api\V1\MobileNotificationController;
use App\Http\Controllers\Api\V1\MobilePossibleRecentMatchesController;
use App\Http\Controllers\Api\V1\MobilePreviousEvidencePhotoController;
use App\Http\Controllers\Api\V1\MobileReportController;
use App\Http\Controllers\Api\V1\MobileReportStatusController;
use App\Http\Controllers\Api\V1\MonthlyReportSummaryController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\ReferralSummaryController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\ReportExportController;
use App\Http\Controllers\Api\V1\ReportImageController;
use App\Http\Controllers\Api\V1\ReportPossibleMatchesController;
use App\Http\Controllers\Api\V1\ReportReferralController;
use App\Http\Controllers\Api\V1\ReviewReportController;
use App\Http\Controllers\Api\V2\MobileReportController as MobileV2ReportController;
use App\Http\Controllers\Auth\ChangeEmailController;
use App\Http\Controllers\Auth\ChangePasswordController;
use App\Http\Controllers\Auth\DisableBiometricController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::post('/v1/mobile/auth/login', [MobileAuthController::class, 'login'])
    ->middleware('throttle:login');
Route::get('/v1/reference/locations', LocationReferenceController::class);

Route::prefix('v1')->middleware(['auth:sanctum', 'verified'])->group(function () {
    Route::get('/me', AuthenticatedUserController::class);
    Route::post('/auth/password', ChangePasswordController::class)
        ->name('api.v1.auth.password');
    Route::patch('/auth/email', ChangeEmailController::class)
        ->name('api.v1.auth.email');
    Route::post('/auth/biometric/disable', DisableBiometricController::class)
        ->name('api.v1.auth.biometric.disable');
    Route::patch('/admin/users/{user:uuid}/role', AdminUserRoleController::class)
        ->name('api.v1.admin.users.role');
    Route::get('/dashboard/summary', DashboardSummaryController::class);
    Route::get('/advisories', [AdvisoryController::class, 'index'])
        ->name('api.v1.advisories.index');
    Route::post('/advisories', [AdvisoryController::class, 'store'])
        ->name('api.v1.advisories.store');
    Route::get('/advisories/{advisory}', [AdvisoryController::class, 'show'])
        ->name('api.v1.advisories.show');
    Route::patch('/advisories/{advisory}', [AdvisoryController::class, 'update'])
        ->name('api.v1.advisories.update');
    Route::post('/advisories/{advisory}/validate', [AdvisoryController::class, 'validate'])
        ->name('api.v1.advisories.validate');
    Route::post('/advisories/{advisory}/retire', [AdvisoryController::class, 'retire'])
        ->name('api.v1.advisories.retire');
    Route::match(['patch', 'post'], '/advisories/{advisory}/status', [AdvisoryController::class, 'setStatus'])
        ->name('api.v1.advisories.status');
    Route::get('/field-reporters', FieldReporterController::class);
    Route::get('/experts', ExpertDirectoryController::class)
        ->name('api.v1.experts.index');
    Route::get('/reports/expert-queue', ExpertQueueController::class)
        ->name('api.v1.reports.expert-queue');
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::patch('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::get('/reports', [ReportController::class, 'index']);
    Route::get('/reports/export', ReportExportController::class)
        ->name('api.v1.reports.export');
    Route::get('/reports/summary', MonthlyReportSummaryController::class)
        ->name('api.v1.reports.summary');
    Route::get('/reports/map', MapReportController::class)
        ->name('api.v1.reports.map');
    Route::get('/reports/field-validation-queue', FieldValidationQueueController::class)
        ->name('api.v1.reports.field-validation-queue');
    Route::get('/reports/{report}/image', ReportImageController::class)
        ->name('api.v1.reports.image');
    Route::get('/reports/{report}/consult', ExpertConsultController::class)
        ->name('api.v1.reports.consult');
    Route::get('/reports/{report}/validation-photo', FieldValidationPhotoController::class)
        ->name('api.v1.reports.validation-photo');
    Route::get('/reports/{report}/referral/summary', ReferralSummaryController::class)
        ->name('api.v1.reports.referral.summary');
    Route::get('/reports/{report}/referral-summary', ReferralSummaryController::class)
        ->name('api.v1.reports.referral-summary');
    Route::post('/reports/{report}/referral', [ReportReferralController::class, 'store']);
    Route::post('/reports/{report}/referral/finding', ExpertReferralFindingController::class)
        ->name('api.v1.reports.referral.finding');
    Route::post('/reports/{report}/referral/confirm', ConfirmExpertReferralController::class)
        ->name('api.v1.reports.referral.confirm');
    Route::post('/reports/{report}/referral/response', ExpertReferralResponseController::class);
    Route::get('/reports/{report}/possible-matches', ReportPossibleMatchesController::class)
        ->name('api.v1.reports.possible-matches');
    Route::get('/reports/{report}', [ReportController::class, 'show']);
    Route::patch('/reports/{report}/review', ReviewReportController::class);
    Route::post('/reports/{report}/duplicate-link', [LinkDuplicateReportController::class, 'store'])
        ->name('api.v1.reports.duplicate-link');
    Route::delete('/reports/{report}/duplicate-link', [LinkDuplicateReportController::class, 'destroy'])
        ->name('api.v1.reports.duplicate-unlink');

    Route::get('/mobile/auth/me', [MobileAuthController::class, 'me'])
        ->middleware('mobile.token');
    Route::get('/mobile/auth/devices', [MobileAuthController::class, 'devices'])
        ->middleware('mobile.token')
        ->name('api.v1.mobile.auth.devices');
    Route::delete('/mobile/auth/devices/{device}', [MobileAuthController::class, 'revokeDevice'])
        ->middleware('mobile.token')
        ->name('api.v1.mobile.auth.devices.revoke')
        ->whereNumber('device');
    Route::post('/mobile/auth/enroll', [MobileAuthController::class, 'enroll'])
        ->middleware('mobile.token')
        ->name('api.v1.mobile.auth.enroll');
    Route::delete('/mobile/auth/logout', [MobileAuthController::class, 'logout'])
        ->middleware('mobile.token');

    Route::get('/mobile/reports/possible-matches', MobilePossibleRecentMatchesController::class)
        ->middleware(['mobile.token', 'abilities:report:submit'])
        ->name('api.v1.mobile.reports.possible-matches');
    Route::post('/mobile/reports', [MobileReportController::class, 'store'])
        ->middleware(['mobile.token', 'abilities:report:submit', 'throttle:30,1']);
    Route::get('/mobile/reports/statuses', MobileReportStatusController::class)
        ->middleware(['mobile.token', 'abilities:report:status']);
    Route::get('/mobile/map-tiles/{z}/{x}/{y}.png', MobileMapTileController::class)
        ->middleware(['mobile.token', 'abilities:report:status'])
        ->whereNumber(['z', 'x', 'y'])
        ->name('api.v1.mobile.map-tiles');
    Route::get('/mobile/assignments', MobileFieldValidationAssignmentController::class)
        ->middleware(['mobile.token', 'abilities:assignment:read']);
    Route::get('/mobile/assignments/{assignment}/previous-evidence-photo', MobilePreviousEvidencePhotoController::class)
        ->middleware(['mobile.token', 'abilities:assignment:read'])
        ->name('api.v1.mobile.assignments.previous-evidence-photo');
    Route::get('/mobile/notifications', MobileNotificationController::class)
        ->middleware(['mobile.token', 'abilities:notification:read']);
    Route::post('/mobile/notifications/read-all', [MobileNotificationController::class, 'markAllAsRead'])
        ->middleware(['mobile.token', 'abilities:notification:read'])
        ->name('api.v1.mobile.notifications.read-all');
    Route::patch('/mobile/notifications/{notification}/read', [MobileNotificationController::class, 'markRead'])
        ->middleware(['mobile.token', 'abilities:notification:read'])
        ->name('api.v1.mobile.notifications.read');
    Route::post('/mobile/assignments/{assignment}/completion', MobileFieldValidationCompletionController::class)
        ->middleware(['mobile.token', 'abilities:assignment:complete', 'throttle:30,1']);
});

Route::prefix('v2')->middleware(['auth:sanctum', 'verified'])->group(function () {
    Route::post('/mobile/reports', [MobileV2ReportController::class, 'store'])
        ->middleware(['mobile.token', 'abilities:report:submit', 'throttle:30,1'])
        ->name('api.v2.mobile.reports.store');
    Route::get('/mobile/reports/statuses', MobileReportStatusController::class)
        ->middleware(['mobile.token', 'abilities:report:status'])
        ->name('api.v2.mobile.reports.statuses');
});

Route::prefix('v3')->middleware(['auth:sanctum', 'verified'])->group(function () {
    Route::get('/mobile/reports/statuses', MobileReportStatusController::class)
        ->middleware(['mobile.token', 'abilities:report:status'])
        ->name('api.v3.mobile.reports.statuses');
});
