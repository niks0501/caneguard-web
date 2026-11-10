<?php

namespace App\Console\Commands;

use App\Actions\Notifications\CreateLifecycleNotifications;
use Illuminate\Console\Command;

class DeriveFollowUpDueNotifications extends Command
{
    protected $signature = 'notifications:derive-follow-up-due';

    protected $description = 'Create follow-up-due notifications for overdue open field validation assignments';

    public function handle(CreateLifecycleNotifications $notifications): int
    {
        $created = $notifications->ensureFollowUpDueNotifications();

        $this->info("Created {$created} follow-up due notifications.");

        return self::SUCCESS;
    }
}
