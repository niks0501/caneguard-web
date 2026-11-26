<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('reports:generate-weekly')
    ->everyFifteenMinutes()
    ->timezone('Asia/Manila')
    ->withoutOverlapping(15);

Schedule::command('reports:send-weekly-reminders')
    ->everyFifteenMinutes()
    ->timezone('Asia/Manila')
    ->withoutOverlapping(10);

Schedule::command('notifications:derive-follow-up-due')
    ->everyFifteenMinutes()
    ->timezone('Asia/Manila')
    ->withoutOverlapping(10);

Schedule::command('auth:prune-security-audits')
    ->dailyAt('02:00')
    ->timezone('Asia/Manila')
    ->withoutOverlapping(60);

Schedule::command('caneguard:prune-api-tokens')
    ->dailyAt('02:30')
    ->timezone('Asia/Manila')
    ->withoutOverlapping(60);

Schedule::command('caneguard:prune-removed-aerial-analyses')
    ->dailyAt('02:45')
    ->timezone('Asia/Manila')
    ->withoutOverlapping(60);
