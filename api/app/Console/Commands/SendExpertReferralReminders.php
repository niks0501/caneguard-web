<?php

namespace App\Console\Commands;

use App\Actions\Notifications\CreateLifecycleNotifications;
use Illuminate\Console\Command;

class SendExpertReferralReminders extends Command
{
    protected $signature = 'experts:referral-reminders';

    protected $description = 'Create due-soon and overdue expert referral notifications';

    public function handle(CreateLifecycleNotifications $notifications): int
    {
        $created = $notifications->ensureExpertReferralReminderNotifications();
        $this->info("Created {$created} expert referral reminder(s).");

        return self::SUCCESS;
    }
}
