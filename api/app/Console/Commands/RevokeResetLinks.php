<?php

namespace App\Console\Commands;

use App\Support\MailDelivery;
use Illuminate\Console\Command;

class RevokeResetLinks extends Command
{
    protected $signature = 'auth:revoke-reset-links';

    protected $description = 'Invalidate every outstanding password reset link (run while the rollback barrier is engaged, before a rollback switches to an older release)';

    public function handle(): int
    {
        $revoked = MailDelivery::revokeResetTokens();
        $this->info("Revoked {$revoked} reset links.");

        return self::SUCCESS;
    }
}
