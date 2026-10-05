<?php

namespace App\Actions\Notifications;

use App\Models\Report;
use App\Models\User;
use App\Notifications\NewCaseSubmittedNotification;
use App\Security\DistrictAccess;

class CreateNewCaseNotifications
{
    public function handle(Report $report): void
    {
        User::query()
            ->whereIn('role', User::officeRoles())
            ->get()
            ->each(function (User $recipient) use ($report): void {
                if (! app(DistrictAccess::class)->report($recipient, $report)) {
                    return;
                }
                $recipient->notify(new NewCaseSubmittedNotification(
                    $report->uuid,
                    $report->reference_code,
                ));
            });
    }
}
