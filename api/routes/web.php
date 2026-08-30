<?php

use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\Auth\ForgotPasswordController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\Auth\ResendVerificationController;
use App\Http\Controllers\Auth\ResetPasswordController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::post('/register', RegisterController::class)
    ->middleware('throttle:register');
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
