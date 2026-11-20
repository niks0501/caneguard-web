<?php

namespace App\Console\Commands;

use App\Support\RollbackBarrier;
use Illuminate\Console\Command;

class SetRollbackBarrier extends Command
{
    protected $signature = 'auth:rollback-barrier {state : "on" pauses reset-link and set-password issuance, "off" resumes it}';

    protected $description = 'Engage or release the rollback barrier that pauses reset-link and set-password issuance';

    public function handle(): int
    {
        $state = (string) $this->argument('state');
        if (! in_array($state, ['on', 'off'], true)) {
            $this->error('State must be "on" or "off".');

            return self::FAILURE;
        }

        if ($state === 'on') {
            RollbackBarrier::engage();
            $this->info('Rollback barrier engaged; issuance is paused.');
        } else {
            RollbackBarrier::release();
            $this->info('Rollback barrier released; issuance resumed.');
        }

        return self::SUCCESS;
    }
}
