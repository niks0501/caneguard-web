<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::post('/login', LoginController::class)
    ->middleware('throttle:login');
Route::post('/logout', LogoutController::class)
    ->middleware('auth');
