<?php

use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\Auth\ForgotPasswordController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\Auth\ResendVerificationController;
use App\Http\Controllers\Auth\ResetPasswordController;
use App\Http\Middleware\EnsurePublicRegistrationEnabled;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

$serveSpa = static function (Request $request) {
    $index = public_path('index.html');
    if (is_file($index)) {
        $request->attributes->set('spa_shell', true);
        // The built shell carries one inline theme script marked with this
        // placeholder; give it the CSP nonce of this response.
        $html = str_replace(
            '__CSP_NONCE__',
            (string) $request->attributes->get('csp_nonce'),
            (string) file_get_contents($index),
        );

        return response($html, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-cache, private',
        ]);
    }

    return view('welcome');
};
Route::get('/', $serveSpa);

// Registered before the SPA fallback so Android can verify App Links for the
// mobile auth links (/reset-password, /verify-email).
Route::get('/.well-known/assetlinks.json', function () {
    $fingerprints = (array) config('caneguard.android_app_links.cert_fingerprints');
    if ($fingerprints === []) {
        abort(404);
    }

    return response()->json([[
        'relation' => ['delegate_permission/common.handle_all_urls'],
        'target' => [
            'namespace' => 'android_app',
            'package_name' => (string) config('caneguard.android_app_links.package_name'),
            'sha256_cert_fingerprints' => $fingerprints,
        ],
    ]]);
});

Route::post('/register', RegisterController::class)
    ->middleware(['throttle:register', EnsurePublicRegistrationEnabled::class]);
Route::post('/login', LoginController::class)
    ->middleware('throttle:login');
Route::post('/logout', LogoutController::class)
    ->middleware('auth');
Route::get('/email/verify/{id}/{hash}', EmailVerificationController::class)
    ->middleware('signed')
    ->name('verification.verify');
Route::post('/email/verification-notification', ResendVerificationController::class)
    ->middleware('throttle:verification')
    ->name('verification.send');
Route::post('/forgot-password', ForgotPasswordController::class)
    ->middleware('throttle:password-reset')
    ->name('password.email');
Route::post('/reset-password', ResetPasswordController::class)
    ->middleware('throttle:password-reset')
    ->name('password.update');

Route::get('/{path}', $serveSpa)
    ->where('path', '^(?!api(?:/|$)|sanctum(?:/|$)|storage(?:/|$)).*');
