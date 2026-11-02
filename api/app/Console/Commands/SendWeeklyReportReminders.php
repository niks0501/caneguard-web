<?php

namespace App\Console\Commands;

use App\Models\DistrictReportVersion;
use App\Models\User;
use App\Notifications\WeeklyReportReminderNotification;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\DB;

class SendWeeklyReportReminders extends Command
{
    protected $signature = 'reports:send-weekly-reminders';

    protected $description = 'Notify Admins and Reviewers once per week when last week\'s report has no approved current version';

    public function handle(DistrictAccess $access): int
    {
        $districtId = $access->pilotId();
        $settings = $districtId === null ? null : DB::table('district_reporting_settings')->where('district_id', $districtId)->first();
        if ($settings === null || $settings->reminder_day === null || $settings->reminder_time === null) {
            return self::SUCCESS;
        }

        $now = CarbonImmutable::now('Asia/Manila');
        [$hour, $minute] = array_map('intval', explode(':', $settings->reminder_time));
        $slot = $now->startOfWeek()->addDays((int) $settings->reminder_day - 1)->setTime($hour, $minute);
        // Due from the saved slot until the end of that Manila day, so a missed run still catches up.
        if ($now->lt($slot) || ! $now->isSameDay($slot)) {
            return self::SUCCESS;
        }

        $weekStart = $now->subWeek()->startOfWeek();
        $latest = DistrictReportVersion::query()->where('district_id', $districtId)
            ->where('week_start', $weekStart->toDateString())->orderByDesc('version')->first();
        if ($latest?->approved_at !== null) {
            return self::SUCCESS;
        }

        $week = $weekStart->format('o-\WW');
        $state = $latest === null ? WeeklyReportReminderNotification::STATE_NOT_PREPARED : WeeklyReportReminderNotification::STATE_AWAITING_APPROVAL;
        $sent = 0;
        User::query()->whereIn('role', User::officeRoles())->where('is_active', true)->get()
            ->filter(fn (User $user): bool => $user->hasWebAccess())
            ->each(function (User $user) use ($week, $state, &$sent): void {
                $notification = new WeeklyReportReminderNotification($user->uuid, $week, $state);
                if (DatabaseNotification::query()->whereKey($notification->id)->exists()) {
                    return;
                }
                try {
                    $user->notify($notification);
                    $sent++;
                } catch (UniqueConstraintViolationException $exception) {
                    if (! DatabaseNotification::query()->whereKey($notification->id)->exists()) {
                        throw $exception;
                    }
                }
            });

        $this->info("Sent {$sent} weekly report reminders for {$week}.");

        return self::SUCCESS;
    }
}
