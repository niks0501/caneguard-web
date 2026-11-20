<?php

namespace Tests\MySql;

use App\Models\SecurityAudit;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SecurityAuditPruneMySqlTest extends TestCase
{
    public function test_prune_deletes_old_audits_without_a_provisioning_channel_and_keeps_bootstrap_provenance(): void
    {
        $this->assertSame('mysql', DB::connection()->getDriverName());
        config(['caneguard.security_audit.retention_days' => 30]);
        $old = now()->subDays(31);

        DB::beginTransaction();
        try {
            $missingKey = SecurityAudit::query()->create(['action' => SecurityAudit::ACTION_ACCOUNT_INVITE, 'outcome' => SecurityAudit::OUTCOME_SUCCESS, 'metadata' => ['via' => 'web'], 'created_at' => $old]);
            $nullMetadata = SecurityAudit::query()->create(['action' => SecurityAudit::ACTION_REGISTRATION, 'outcome' => SecurityAudit::OUTCOME_SUCCESS, 'metadata' => null, 'created_at' => $old]);
            $webChannel = SecurityAudit::query()->create(['action' => SecurityAudit::ACTION_ACCOUNT_CREATED, 'outcome' => SecurityAudit::OUTCOME_SUCCESS, 'metadata' => ['provisioning_channel' => 'web'], 'created_at' => $old]);
            $bootstrap = SecurityAudit::query()->create(['action' => SecurityAudit::ACTION_ACCOUNT_CREATED, 'outcome' => SecurityAudit::OUTCOME_SUCCESS, 'metadata' => ['provisioning_channel' => 'bootstrap'], 'created_at' => $old]);
            $failedInvite = SecurityAudit::query()->create(['action' => SecurityAudit::ACTION_ACCOUNT_INVITE, 'outcome' => SecurityAudit::OUTCOME_FAILURE, 'metadata' => ['provisioning_channel' => 'bootstrap'], 'created_at' => $old]);

            $this->artisan('auth:prune-security-audits')->assertSuccessful();

            $this->assertFalse(SecurityAudit::query()->whereKey($missingKey->id)->exists());
            $this->assertFalse(SecurityAudit::query()->whereKey($nullMetadata->id)->exists());
            $this->assertFalse(SecurityAudit::query()->whereKey($webChannel->id)->exists());
            $this->assertFalse(SecurityAudit::query()->whereKey($failedInvite->id)->exists());
            $this->assertTrue(SecurityAudit::query()->whereKey($bootstrap->id)->exists());
        } finally {
            DB::rollBack();
        }
    }
}
