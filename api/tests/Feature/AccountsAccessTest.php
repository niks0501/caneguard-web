<?php

namespace Tests\Feature;

use App\Actions\Auth\ReconcileDistrictAccess;
use App\Models\AccountAccessEvent;
use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\DistrictMembership;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class AccountsAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['caneguard.accounts_enabled' => true]);
    }

    public function test_deprecated_discovery_exposes_only_web_role_status_without_district_authority(): void
    {
        [$actor] = $this->manager();
        $this->candidate(false);
        $foreignDistrict = District::query()->create(['code' => 'foreign', 'name' => 'Foreign']);
        $foreign = User::factory()->reviewer()->inDistrict($foreignDistrict)->create();
        $this->actingAs($actor, 'web');
        $this->getJson('/api/v2/admin/accounts')->assertOk()->assertHeader('Deprecation', 'true')
            ->assertHeader('cache-control', 'no-store, private')->assertJsonPath('meta.total', 2)
            ->assertJsonMissingPath('data.0.grant_revisions');
        $this->getJson('/api/v2/admin/accounts/'.$foreign->uuid)->assertOk()->assertJsonPath('data.role', 'reviewer');
        $this->getJson('/api/v2/admin/accounts/'.$foreign->uuid.'/events')->assertOk();
        $this->getJson('/api/v2/admin/accounts?page=0')->assertUnprocessable();
    }

    public function test_every_read_boundary_denies_reviewer_unsupported_unverified_and_bearer_actors(): void
    {
        [$manager, $district] = $this->manager();
        $candidate = $this->candidate();
        foreach ([User::factory()->reviewer()->inDistrict($district)->create(),
            User::factory()->farmer()->create(), User::factory()->admin()->unverified()->inDistrict($district)->create(),
            User::factory()->create(['role' => 'disabled'])] as $actor) {
            Auth::forgetGuards();
            $this->actingAs($actor, 'web');
            foreach (['', '/'.$candidate->uuid, '/'.$candidate->uuid.'/events'] as $suffix) {
                $this->getJson('/api/v2/admin/accounts'.$suffix)->assertForbidden();
            }
        }
        Auth::guard('web')->logout();
        Auth::forgetGuards();
        $this->withToken($manager->createToken('wildcard', ['*'])->plainTextToken)->getJson('/api/v2/admin/accounts')->assertForbidden();
        Auth::forgetGuards();
        $this->withHeader('Authorization', '')->getJson('/api/v2/admin/accounts')->assertUnauthorized();
    }

    public function test_admission_is_one_documented_atomic_decision_with_no_default_keys_and_idempotent_retry(): void
    {
        [$actor] = $this->manager();
        $target = $this->candidate();
        $oldToken = $target->createToken('old');
        DB::table('sessions')->insert(['id' => 'old', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);
        $this->actingAs($actor, 'web');
        $payload = $this->accessPayload($target, 'admit', 'admin');
        $result = $this->putJson($this->path($target), $payload)->assertOk()->assertJsonPath('data.role', 'admin')
            ->assertJsonPath('data.is_active', true)->assertJsonMissingPath('data.effective_grants')->assertJsonPath('credentials_revoked', true)->json();
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $oldToken->accessToken->id]);
        $this->assertDatabaseMissing('sessions', ['id' => 'old']);
        $this->assertDatabaseCount('account_access_events', 1);
        $this->putJson($this->path($target), $payload)->assertOk()->assertJsonPath('event_id', $result['event_id']);
        $this->assertDatabaseCount('account_access_events', 1);
        $this->putJson($this->path($target), [...$payload, 'office_reference' => 'different'])->assertConflict()->assertJsonPath('code', 'IDEMPOTENCY_CONFLICT');
        $this->getJson('/api/v2/admin/accounts/'.$target->uuid.'/events')->assertOk()->assertJsonPath('data.0.before.role', 'farmer')
            ->assertJsonPath('data.0.actor_name', $actor->name)->assertJsonPath('data.0.action', 'district_access_changed');
        $serialized = json_encode($result);
        $this->assertStringNotContainsString('current_password', $serialized);
        $this->assertStringNotContainsString('remember_token', $serialized);
        $this->assertStringNotContainsString('password', DB::table('account_access_receipts')->value('response'));
    }

    public function test_triage_does_not_issue_membership_change_verification_or_revoke_farmer_credentials(): void
    {
        [$actor] = $this->manager();
        $target = $this->candidate(false);
        $token = $target->createToken('farmer');
        $this->actingAs($actor, 'web');
        foreach (['keep_farmer', 'defer', 'reopen'] as $disposition) {
            $body = $this->base($target->fresh()) + ['disposition' => $disposition];
            $this->putJson('/api/v2/admin/accounts/'.$target->uuid.'/review', $body)->assertOk()->assertJsonPath('credentials_revoked', false);
        }
        $this->assertDatabaseMissing('district_memberships', ['user_id' => $target->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $token->accessToken->id]);
        $this->assertFalse($target->fresh()->hasVerifiedEmail());
        $this->assertSame('farmer', $target->fresh()->role);
        $this->assertDatabaseCount('account_access_events', 3);
    }

    public function test_invalid_contract_transition_step_up_self_and_unknown_authority_have_no_effect(): void
    {
        [$actor] = $this->manager();
        $target = $this->candidate(false);
        $this->actingAs($actor, 'web');
        $this->putJson($this->path($target), $this->accessPayload($target, 'admit'))->assertUnprocessable()->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');
        $target->forceFill(['email_verified_at' => now()])->save();
        $body = $this->accessPayload($target->fresh(), 'admit');
        foreach ([['contract_version' => 'accounts-access-v99'], ['current_password' => 'incorrect'], ['office_reference' => '   '],
            ['operation' => 'replace'], ['district_id' => 1], ['desired' => ['role' => 'expert', 'grants' => []]],
            ['desired' => ['role' => 'admin', 'grants' => ['*']]], ['desired' => ['role' => 'admin', 'grants' => ['staff:manage', 'staff:manage']]]] as $override) {
            $this->putJson($this->path($target), array_replace($body, $override))->assertUnprocessable();
        }
        $this->putJson($this->path($actor), $this->accessPayload($actor, 'replace'))->assertUnprocessable()->assertJsonPath('code', 'SELF_CHANGE_FORBIDDEN');
        $this->assertDatabaseMissing('district_memberships', ['user_id' => $target->id]);
        $this->assertDatabaseCount('account_access_events', 0);
        $this->assertDatabaseHas('security_audits', ['action' => 'step_up', 'outcome' => 'failure']);
    }

    public function test_single_approver_transfer_preserves_other_keys_and_revokes_old_revision_and_both_credentials(): void
    {
        [$actor, $district] = $this->manager();
        $old = User::factory()->admin()->inDistrict($district)->create();
        $new = User::factory()->admin()->inDistrict($district)->create();
        $approve = DistrictGrant::query()->create(['user_id' => $old->id, 'district_id' => $district->id, 'ability' => 'report:approve']);
        DistrictGrant::query()->create(['user_id' => $old->id, 'district_id' => $district->id, 'ability' => 'report:send']);
        $oldToken = $old->createToken('old');
        $newToken = $new->createToken('new');
        $this->actingAs($actor, 'web');
        $this->putJson($this->path($new), $this->accessPayload($new->fresh(), 'replace', 'admin', ['report:approve']))
            ->assertConflict()->assertJsonPath('code', 'APPROVER_ALREADY_ASSIGNED');
        $payload = $this->base($new->fresh());
        unset($payload['expected_access_version']);
        $payload += ['from_uuid' => $old->uuid, 'to_uuid' => $new->uuid, 'from_expected_access_version' => $old->fresh()->access_version, 'to_expected_access_version' => $new->fresh()->access_version];
        $response = $this->postJson('/api/v2/admin/accounts/approval-transfer', $payload)->assertOk()->assertJsonCount(2, 'affected')->json();
        $this->postJson('/api/v2/admin/accounts/approval-transfer', $payload)->assertOk()->assertJsonPath('operation_id', $response['operation_id']);
        $this->assertNotNull($approve->fresh()->revoked_at);
        $this->assertGreaterThan(1, $approve->fresh()->revision);
        $this->assertDatabaseHas('district_grants', ['user_id' => $old->id, 'ability' => 'report:send', 'revoked_at' => null]);
        $this->assertSame(1, DistrictGrant::query()->where('ability', 'report:approve')->whereNull('revoked_at')->count());
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $oldToken->accessToken->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $newToken->accessToken->id]);
        $this->assertSame(2, AccountAccessEvent::query()->where('operation_id', $response['operation_id'])->count());
        $this->assertDatabaseHas('district_memberships', ['user_id' => $old->id, 'revoked_at' => null]);
    }

    public function test_revoke_preserves_identity_role_history_and_restore_never_resurrects_keys(): void
    {
        [$actor, $district] = $this->manager();
        $target = User::factory()->admin()->inDistrict($district)->create();
        DistrictGrant::query()->create(['user_id' => $target->id, 'district_id' => $district->id, 'ability' => 'report:send']);
        $this->actingAs($actor, 'web');
        $target->refresh();
        $this->putJson($this->path($target), $this->accessPayload($target, 'revoke', 'admin'))->assertOk()->assertJsonPath('data.role', 'admin')->assertJsonPath('data.is_active', false);
        $this->putJson($this->path($target), $this->accessPayload($target->fresh(), 'replace', 'admin'))->assertUnprocessable();
        $this->putJson($this->path($target), $this->accessPayload($target->fresh(), 'restore', 'admin'))->assertOk()->assertJsonPath('data.is_active', true)->assertJsonMissingPath('data.effective_grants');
        $this->assertDatabaseHas('users', ['uuid' => $target->uuid, 'role' => 'admin']);
        $this->assertDatabaseCount('account_access_events', 2);
        $version = $target->fresh()->access_version;
        $this->putJson($this->path($target), $this->accessPayload($target->fresh(), 'replace', 'admin'))->assertOk()->assertJsonPath('code', 'ACCOUNT_ACCESS_UNCHANGED');
        $this->assertSame($version, $target->fresh()->access_version);
        $this->assertDatabaseCount('account_access_events', 2);
    }

    public function test_stale_console_email_and_security_changes_reject_edits_and_event_failure_rolls_back_everything(): void
    {
        [$actor, $district] = $this->manager();
        $target = $this->candidate();
        $body = $this->accessPayload($target, 'admit');
        $target->forceFill(['email_verified_at' => null])->save();
        $this->actingAs($actor, 'web');
        $this->putJson($this->path($target), $body)->assertConflict()->assertJsonPath('code', 'ACCESS_VERSION_CONFLICT');
        $target->forceFill(['email_verified_at' => now()])->save();
        $body = $this->accessPayload($target->fresh(), 'admit');
        AccountAccessEvent::creating(fn () => throw new \RuntimeException('synthetic audit failure'));
        $this->putJson($this->path($target), $body)->assertStatus(500);
        $this->assertDatabaseMissing('district_memberships', ['user_id' => $target->id]);
        $this->assertSame('farmer', $target->fresh()->role);
        $this->assertDatabaseCount('account_access_receipts', 0);
        $this->assertDatabaseCount('account_access_events', 0);
    }

    public function test_common_console_and_v1_service_enforce_singleton_and_role_changes_use_durable_history(): void
    {
        [$actor, $district] = $this->manager();
        $old = User::factory()->admin()->inDistrict($district)->create();
        app(ReconcileDistrictAccess::class)->handle($old->fresh(), $district, 'admin', ['report:approve'], false, 'approved synthetic roster');
        $target = User::factory()->reviewer()->inDistrict($district)->create();
        $this->actingAs($actor, 'web');
        $this->putJson('/api/v1/admin/users/'.$target->uuid.'/access', ['current_password' => 'password', 'role' => 'admin', 'grants' => ['report:approve'], 'revoke' => false, 'office_reference' => 'synthetic'])
            ->assertConflict()->assertJsonPath('code', 'APPROVER_ALREADY_ASSIGNED');
        $this->patchJson('/api/v1/admin/users/'.$target->uuid.'/role', ['current_password' => 'password', 'role' => 'admin', 'office_reference' => 'synthetic role review'])
            ->assertOk()->assertJsonPath('user.role', 'admin');
        $this->assertDatabaseHas('account_access_events', ['target_id' => $target->id, 'office_reference' => 'synthetic role review']);
    }

    public function test_legacy_flags_and_memberships_no_longer_gate_active_admin_but_disabled_does(): void
    {
        [$actor, $district] = $this->manager();
        $this->actingAs($actor, 'web');
        config(['caneguard.accounts_enabled' => false]);
        $this->getJson('/api/v2/admin/accounts')->assertOk()->assertHeader('cache-control', 'no-store, private');
        config(['caneguard.accounts_enabled' => true, 'caneguard.pilot_district_code' => '']);
        $this->getJson('/api/v2/admin/accounts')->assertOk();
        config(['caneguard.pilot_district_code' => $district->code]);
        DistrictMembership::query()->where('user_id', $actor->id)->firstOrFail()->update(['revoked_at' => now()]);
        $this->actingAs($actor->fresh(), 'web');
        $this->getJson('/api/v2/admin/accounts')->assertOk();
        $actor->forceFill(['is_active' => false])->save();
        $this->actingAs($actor->fresh(), 'web');
        $this->getJson('/api/v2/admin/accounts')->assertUnauthorized();
    }

    public function test_registration_records_origin_but_never_role_keys_membership_or_verification_from_input(): void
    {
        Notification::fake();
        config(['caneguard.self_registration_enabled' => true, 'caneguard.pilot_roster_certified' => true]);
        $this->postJson('/register', [
            'name' => 'Synthetic public candidate', 'email' => 'signup@example.test', 'password' => 'Synthetic signup passphrase',
            'role' => 'admin', 'district_id' => 99999, 'email_verified_at' => now(), 'grants' => ['staff:manage'],
        ])->assertForbidden()->assertJsonPath('code', 'REGISTRATION_DISABLED');
        $this->assertDatabaseMissing('users', ['email' => 'signup@example.test']);
        $this->assertDatabaseCount('district_memberships', 0);
        $this->assertDatabaseCount('district_grants', 0);
        $this->assertGuest();
    }

    public function test_migration_duplicate_preflight_stops_without_choosing_an_approver(): void
    {
        $district = $this->pilotDistrict();
        Schema::table('district_grants', fn ($table) => $table->dropUnique(['active_approver_district']));
        foreach (range(1, 2) as $index) {
            $user = User::factory()->admin()->inDistrict($district)->create();
            DistrictGrant::query()->create(['user_id' => $user->id, 'district_id' => $district->id, 'ability' => 'report:approve']);
        }
        $migration = require database_path('migrations/2026_10_05_000002_add_account_access_management.php');
        try {
            $migration->up();
            $this->fail('Contradictory legacy approvers must stop migration before side effects.');
        } catch (\RuntimeException $failure) {
            $this->assertSame('Multiple active report approvers require approved operator reconciliation before migration.', $failure->getMessage());
        }
        $this->assertSame(2, DistrictGrant::query()->whereNull('revoked_at')->count());
        $this->assertDatabaseCount('account_access_events', 0);
    }

    public function test_stale_security_model_cannot_reuse_or_reduce_a_grant_advanced_access_version(): void
    {
        $target = $this->candidate();
        $stale = $target->fresh();
        DistrictMembership::query()->create(['user_id' => $target->id, 'district_id' => $this->pilotDistrict()->id]);
        $currentVersion = $target->fresh()->access_version;
        $stale->forceFill(['email_verified_at' => null])->save();
        $this->assertSame($currentVersion + 1, $target->fresh()->access_version);
        $this->assertSame($currentVersion + 1, $stale->access_version);
        $this->assertFalse($target->fresh()->hasVerifiedEmail());
    }

    private function manager(): array
    {
        $district = $this->pilotDistrict();
        $actor = User::factory()->admin()->inDistrict($district)->create();
        DistrictGrant::query()->create(['user_id' => $actor->id, 'district_id' => $district->id, 'ability' => 'staff:manage']);

        return [$actor->fresh(), $district];
    }

    private function candidate(bool $verified = true): User
    {
        return User::factory()->farmer()->create(['registration_origin' => 'public_signup', 'email_verified_at' => $verified ? now() : null]);
    }

    private function base(User $target): array
    {
        return ['contract_version' => 'accounts-access-v1', 'current_password' => 'password', 'expected_access_version' => $target->access_version,
            'office_reference' => 'synthetic office decision', 'idempotency_key' => (string) Str::uuid()];
    }

    private function accessPayload(User $target, string $operation, string $role = 'reviewer', array $grants = []): array
    {
        return $this->base($target) + ['operation' => $operation, 'desired' => compact('role', 'grants')];
    }

    private function path(User $target): string
    {
        return '/api/v2/admin/accounts/'.$target->uuid.'/access';
    }
}
