<?php

use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\V1\AdminUserRoleController;
use App\Http\Controllers\Api\V1\AdvisoryController;
use App\Http\Controllers\Api\V1\AuthenticatedUserController;
use App\Http\Controllers\Api\V1\DashboardSummaryController;
use App\Http\Controllers\Api\V1\DistrictAccessController;
use App\Http\Controllers\Api\V1\DistrictReportController;
use App\Http\Controllers\Api\V1\DistrictReportingSettingsController;
use App\Http\Controllers\Api\V1\FieldReporterController;
use App\Http\Controllers\Api\V1\FieldSurveyMapController;
use App\Http\Controllers\Api\V1\FieldValidationPhotoController;
use App\Http\Controllers\Api\V1\FieldValidationQueueController;
use App\Http\Controllers\Api\V1\LinkDuplicateReportController;
use App\Http\Controllers\Api\V1\LocationReferenceController;
use App\Http\Controllers\Api\V1\MapReportController;
use App\Http\Controllers\Api\V1\MobileAuthController;
use App\Http\Controllers\Api\V1\MobileFieldSurveyController;
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
use App\Http\Controllers\Api\V1\OpenReportController;
use App\Http\Controllers\Api\V1\ReferralSummaryController;
use App\Http\Controllers\Api\V1\ReportAnalyticsController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\ReportDocumentController;
use App\Http\Controllers\Api\V1\ReportExportController;
use App\Http\Controllers\Api\V1\ReportHandoffNoteController;
use App\Http\Controllers\Api\V1\ReportImageController;
use App\Http\Controllers\Api\V1\ReportPossibleMatchesController;
use App\Http\Controllers\Api\V1\ReviewReportController;
use App\Http\Controllers\Api\V1\UpdateReportAffectedFieldsController;
use App\Http\Controllers\Api\V1\WebAccountsController;
use App\Http\Controllers\Api\V2\AccountsController;
use App\Http\Controllers\Api\V2\MobileReportController as MobileV2ReportController;
use App\Http\Controllers\Auth\ChangeEmailController;
use App\Http\Controllers\Auth\ChangePasswordController;
use App\Http\Controllers\Auth\DisableBiometricController;
use App\Http\Middleware\DeprecatedAccountApi;
use App\Http\Middleware\EnsureAccountsAccess;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::prefix('v1/admin/accounts')->middleware([
    'auth:sanctum', 'access.identity', 'verified', EnsureAccountsAccess::class,
])->group(function () {
    Route::get('/', [WebAccountsController::class, 'index']);
    Route::get('/{uuid}', [WebAccountsController::class, 'show'])->whereUuid('uuid');
    Route::get('/{uuid}/events', [WebAccountsController::class, 'events'])->whereUuid('uuid');
    Route::patch('/{uuid}', [WebAccountsController::class, 'update'])->whereUuid('uuid')->middleware('throttle:10,1');
});

// Compatibility writers remain functional for this release, with caller telemetry.
Route::prefix('v2/admin/accounts')->middleware([
    'auth:sanctum', 'access.identity', 'verified', EnsureAccountsAccess::class, DeprecatedAccountApi::class,
])->group(function () {
    Route::get('/', [AccountsController::class, 'index']);
    Route::post('/approval-transfer', [AccountsController::class, 'transfer'])->middleware('throttle:10,1');
    Route::get('/{uuid}', [AccountsController::class, 'show'])->whereUuid('uuid');
    Route::get('/{uuid}/events', [AccountsController::class, 'events'])->whereUuid('uuid');
    Route::put('/{uuid}/review', [AccountsController::class, 'review'])->whereUuid('uuid')->middleware('throttle:10,1');
    Route::put('/{uuid}/access', [DistrictAccessController::class, 'accounts'])->whereUuid('uuid')->middleware('throttle:10,1');
});

Route::post('/v1/mobile/auth/login', [MobileAuthController::class, 'login'])
    ->middleware('throttle:login');
Route::get('/v1/reference/locations', LocationReferenceController::class)
    ->middleware(['auth:sanctum', 'verified', 'access.identity', 'mobile.token']);

Route::prefix('v1')->middleware(['auth:sanctum', 'access.identity', 'verified'])->group(function () {
    Route::get('/me', AuthenticatedUserController::class)->middleware('office.access');
    Route::post('/auth/password', ChangePasswordController::class)
        ->name('api.v1.auth.password');
    Route::patch('/auth/email', ChangeEmailController::class)
        ->name('api.v1.auth.email');
    Route::post('/auth/biometric/disable', DisableBiometricController::class)
        ->name('api.v1.auth.biometric.disable');
    Route::middleware('office.access')->group(function () {
        Route::get('/auth/devices', [MobileAuthController::class, 'devices'])->name('api.v1.auth.devices');
        Route::delete('/auth/devices/{device}', [MobileAuthController::class, 'revokeDevice'])->whereNumber('device')->name('api.v1.auth.devices.revoke');
        Route::put('/admin/users/{user:uuid}/access', DistrictAccessController::class)
            ->middleware([EnsureAccountsAccess::class, DeprecatedAccountApi::class]);
        Route::patch('/admin/users/{user:uuid}/role', AdminUserRoleController::class)
            ->middleware([EnsureAccountsAccess::class, DeprecatedAccountApi::class])->name('api.v1.admin.users.role');
        Route::get('/district-reports', [DistrictReportController::class, 'index']);
        Route::post('/district-reports', [DistrictReportController::class, 'prepare']);
        Route::get('/district-reports/{version}/document', [DistrictReportController::class, 'document'])
            ->name('api.v1.reports.documents.district-version');
        Route::get('/district-reports/{version}/pdf', [DistrictReportController::class, 'pdf']);
        Route::get('/district-reporting-settings', [DistrictReportingSettingsController::class, 'show'])->middleware(EnsureAccountsAccess::class);
        Route::put('/district-reporting-settings', [DistrictReportingSettingsController::class, 'update'])->middleware(EnsureAccountsAccess::class);
        Route::post('/district-reports/{version}/approve', [DistrictReportController::class, 'approve'])->middleware(EnsureAccountsAccess::class);
        Route::post('/district-reports/{version}/send', [DistrictReportController::class, 'send'])->middleware(EnsureAccountsAccess::class);
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
        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
        Route::patch('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
        Route::get('/reports', [ReportController::class, 'index']);
        Route::get('/reports/export', ReportExportController::class)
            ->name('api.v1.reports.export');
        Route::get('/reports/documents/report/pdf', ReportDocumentController::class)
            ->name('api.v1.reports.documents.pdf');
        Route::get('/reports/documents/report', ReportDocumentController::class)
            ->name('api.v1.reports.documents');
        Route::get('/reports/summary', MonthlyReportSummaryController::class)
            ->name('api.v1.reports.summary');
        Route::get('/reports/analytics', ReportAnalyticsController::class)
            ->name('api.v1.reports.analytics');
        Route::get('/reports/map', MapReportController::class)
            ->name('api.v1.reports.map');
        Route::get('/field-surveys', FieldSurveyMapController::class)
            ->middleware('throttle:30,1')
            ->name('api.v1.field-surveys.index');
        Route::get('/reports/field-validation-queue', FieldValidationQueueController::class)
            ->name('api.v1.reports.field-validation-queue');
        Route::get('/reports/{report}/image', ReportImageController::class)
            ->name('api.v1.reports.image');
        Route::get('/reports/{report}/validation-photo', FieldValidationPhotoController::class)
            ->name('api.v1.reports.validation-photo');
        Route::get('/reports/{report}/referral/summary', ReferralSummaryController::class)
            ->name('api.v1.reports.referral.summary');
        Route::get('/reports/{report}/referral-summary', ReferralSummaryController::class)
            ->name('api.v1.reports.referral-summary');
        // Retired clients cannot create or advance an expert consult.
        Route::match(['post', 'delete'], '/reports/{report}/referral/{operation?}', fn () => response()->json(['message' => 'The in-system expert workflow was retired.'], 410)
        )->where('operation', '.*');
        Route::get('/reports/{report}/possible-matches', ReportPossibleMatchesController::class)
            ->name('api.v1.reports.possible-matches');
        Route::get('/reports/{report}', [ReportController::class, 'show']);
        Route::put('/reports/{report}/affected-fields', UpdateReportAffectedFieldsController::class)
            ->name('api.v1.reports.affected-fields.update');
        Route::patch('/reports/{report}/review', ReviewReportController::class);
        Route::post('/reports/{report}/open', OpenReportController::class)
            ->name('api.v1.reports.open');
        Route::post('/reports/{report}/handoff-notes', ReportHandoffNoteController::class);
        Route::post('/reports/{report}/duplicate-link', [LinkDuplicateReportController::class, 'store'])
            ->name('api.v1.reports.duplicate-link');
        Route::delete('/reports/{report}/duplicate-link', [LinkDuplicateReportController::class, 'destroy'])
            ->name('api.v1.reports.duplicate-unlink');

    });

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

    Route::middleware('inspector.access')->group(function () {
        Route::post('/mobile/field-surveys', MobileFieldSurveyController::class)
            ->middleware(['mobile.token', 'abilities:report:submit', 'throttle:30,1'])
            ->name('api.v1.mobile.field-surveys.store');
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
});

Route::prefix('v2')->middleware(['auth:sanctum', 'verified', 'inspector.access'])->group(function () {
    Route::post('/mobile/reports', [MobileV2ReportController::class, 'store'])
        ->middleware(['mobile.token', 'abilities:report:submit', 'throttle:30,1'])
        ->name('api.v2.mobile.reports.store');
    Route::get('/mobile/reports/statuses', MobileReportStatusController::class)
        ->middleware(['mobile.token', 'abilities:report:status'])
        ->name('api.v2.mobile.reports.statuses');
});

Route::prefix('v3')->middleware(['auth:sanctum', 'verified', 'inspector.access'])->group(function () {
    Route::get('/mobile/reports/statuses', MobileReportStatusController::class)
        ->middleware(['mobile.token', 'abilities:report:status'])
        ->name('api.v3.mobile.reports.statuses');
});
