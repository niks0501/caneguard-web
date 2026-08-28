<?php

namespace App\Actions\Notifications;

use App\Models\Report;
use App\Models\User;
use App\Notifications\NewCaseSubmittedNotification;

class CreateNewCaseNotifications
{
    public function handle(Report $report): void
    {
        User::query()
            ->whereIn('role', User::webRoles())
            ->get()
            ->each(function (User $recipient) use ($report): void {
                $recipient->notify(new NewCaseSubmittedNotification(
                    $report->uuid,
                    $report->reference_code,
                ));
            });
    }
}
