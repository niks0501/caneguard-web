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
        $this->assertDatabaseMissing('security_audits', ['action' => SecurityAudit::ACTION_REGISTRATION]);
        $this->assertDatabaseHas('security_audits', ['action' => SecurityAudit::ACTION_PRUNE_RUN, 'outcome' => SecurityAudit::OUTCOME_SUCCESS]);
    }

    public function test_security_audit_prune_keeps_bootstrap_provenance_and_removes_other_old_records(): void
    {
        config(['caneguard.security_audit.retention_days' => 30]);
        $old = now()->subDays(31);
        SecurityAudit::query()->create(['action' => SecurityAudit::ACTION_ACCOUNT_CREATED, 'outcome' => SecurityAudit::OUTCOME_SUCCESS, 'metadata' => ['provisioning_channel' => 'bootstrap'], 'created_at' => $old]);
        SecurityAudit::query()->create(['action' => SecurityAudit::ACTION_ACCOUNT_CREATED, 'outcome' => SecurityAudit::OUTCOME_SUCCESS, 'metadata' => ['provisioning_channel' => 'web'], 'created_at' => $old]);
        SecurityAudit::query()->create(['action' => SecurityAudit::ACTION_REGISTRATION, 'outcome' => SecurityAudit::OUTCOME_SUCCESS, 'metadata' => null, 'created_at' => $old]);

        $this->artisan('auth:prune-security-audits')
            ->expectsOutput('Pruned 2 security audit records.')
            ->assertSuccessful();

        $this->assertSame(['bootstrap'], SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_CREATED)
            ->get()->map(fn (SecurityAudit $row) => $row->metadata['provisioning_channel'])->all());
        $this->assertDatabaseMissing('security_audits', ['action' => SecurityAudit::ACTION_REGISTRATION]);
    }

    public function test_security_audit_prune_keeps_the_records_when_its_run_record_cannot_be_written(): void
    {
        config(['caneguard.security_audit.retention_days' => 30]);
        SecurityAudit::query()->create([
            'action' => SecurityAudit::ACTION_REGISTRATION,
            'outcome' => SecurityAudit::OUTCOME_SUCCESS,
            'created_at' => now()->subDays(31),
        ]);
        SecurityAudit::creating(function (SecurityAudit $audit): void {
            if ($audit->action === SecurityAudit::ACTION_PRUNE_RUN) {
                throw new \RuntimeException('audit store down');
            }
        });

        $thrown = null;
        try {
            $this->artisan('auth:prune-security-audits')->run();
        } catch (\RuntimeException $e) {
            $thrown = $e;
        } finally {
            SecurityAudit::flushEventListeners();
        }

        $this->assertSame('audit store down', $thrown?->getMessage());
        $this->assertDatabaseCount('security_audits', 1);
    }

    public function test_api_token_prune_removes_tokens_expired_over_a_day_and_records_the_run(): void
    {
        $user = User::factory()->create();
        $expired = $user->createToken('expired')->accessToken;
        $expired->forceFill(['expires_at' => now()->subHours(25)])->save();
        $fresh = $user->createToken('fresh')->accessToken;
        $fresh->forceFill(['expires_at' => now()->subHours(2)])->save();

        $this->artisan('caneguard:prune-api-tokens')->assertSuccessful();

        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $expired->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $fresh->id]);
        $this->assertDatabaseHas('security_audits', ['action' => SecurityAudit::ACTION_PRUNE_RUN, 'outcome' => SecurityAudit::OUTCOME_SUCCESS]);
    }
}
