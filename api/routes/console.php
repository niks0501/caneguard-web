<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('reports:send-weekly-reminders')
    ->everyFifteenMinutes()
    ->timezone('Asia/Manila')
    ->withoutOverlapping(10);
