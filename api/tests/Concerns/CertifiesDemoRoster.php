<?php

namespace Tests\Concerns;

use App\Models\User;

trait CertifiesDemoRoster
{
    private function certifyDemoRoster(): void
    {
        // Demo seeders deliberately do not supply production roster authority.
        // Exercise the same explicit certification path for API-ready test fixtures.
        $actor = User::query()->where('email', 'admin@caneguard.test')->sole();
        config(['caneguard.access.approver_identity' => $actor->uuid]);
        foreach (User::query()->whereIn('email', ['admin@caneguard.test', 'field@caneguard.test', 'mao@caneguard.test'])->get() as $user) {
            $this->artisan('staff:certify-roster', [
                'user_uuid' => $user->uuid, 'role' => $user->role,
                'authority_reference' => 'SYNTHETIC_TEST_ROSTER_NOT_OFFICE_APPROVAL',
            ])->assertSuccessful();
        }
    }
}
