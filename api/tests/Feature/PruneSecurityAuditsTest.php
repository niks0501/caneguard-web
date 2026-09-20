<?php

namespace Tests\Feature;

use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PruneSecurityAuditsTest extends TestCase
{
    use RefreshDatabase;

    public function test_security_audit_pruning_uses_configured_retention(): void
    {
        config(['caneguard.security_audit.retention_days' => 30]);
        $user = User::factory()->create();
        SecurityAudit::query()->create([
            'target_user_id' => $user->getKey(),
            'action' => SecurityAudit::ACTION_REGISTRATION,
            'outcome' => SecurityAudit::OUTCOME_SUCCESS,
            'created_at' => now()->subDays(31),
        ]);

        $this->artisan('auth:prune-security-audits')
            ->expectsOutput('Pruned 1 security audit records.')
            ->assertSuccessful();
        $this->assertDatabaseCount('security_audits', 0);
    }
}
