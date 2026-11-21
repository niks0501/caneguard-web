<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

class BackfillOnboarding extends Command
{
    protected $signature = 'auth:backfill-onboarding';

    protected $description = 'Mark existing accounts with onboarding evidence (fail-closed; safe to re-run at cutover)';

    public function handle(): int
    {
        $this->info('Marked '.User::backfillOnboardedAt().' accounts as onboarded.');

        return self::SUCCESS;
    }
}
