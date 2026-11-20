<?php

namespace App\Console\Commands;

use App\Support\MailDelivery;
use Illuminate\Console\Command;

class RevokeResetLinks extends Command
{
    protected $signature = 'auth:revoke-reset-links {--expect-none : Fail when any reset link is still outstanding}';

    protected $description = 'Invalidate every outstanding password reset link (run before a rollback switches to an older release)';

    public function handle(): int
    {
        $revoked = MailDelivery::revokeResetTokens();
        $this->info("Revoked {$revoked} reset links.");

        if ($this->option('expect-none') && $revoked > 0) {
            $this->error('Reset links were issued after revocation; the rollback must stop.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
