<?php

namespace Tests\Feature;

use App\Models\DistrictMembership;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Proposal tests (not proof) for the supported field access writer,
 * PUT /api/v1/admin/accounts/{uuid}/access.
 */
class FieldAccessV1Test extends TestCase
{
    use RefreshDatabase;

    /** Proves: admit, disable and re-enable work on the supported path with audit trail and no deprecation header. */
    public function test_admit_revoke_and_restore_run_on_the_supported_path_with_audit_trail(): void
    {
        $this->pilotDistrict();
        $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified']);
        $this->actingAs(User::factory()->admin()->create(), 'web');

        foreach (['admit' => 'active', 'revoke' => 'revoked', 'restore' => 'active'] as $operation => $state) {
            $this->access($field, $operation)->assertOk()->assertHeaderMissing('Deprecation')
                ->assertJsonPath('code', 'ACCOUNT_ACCESS_UPDATED')->assertJsonPath('data.uuid', $field->uuid);
            $this->assertDatabaseHas('account_access_events', ['target_id' => $field->id, 'action' => $operation, 'office_reference' => 'synthetic']);
            $this->assertSame($state === 'active', DistrictMembership::where('user_id', $field->id)->whereNull('revoked_at')->exists());
        }
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $field->id, 'action' => 'district_access_changed']);
    }

    /** Proves: own-password step-up and office reference are still required, with no side effect on failure. */
    public function test_step_up_and_office_reference_are_required(): void
    {
        $this->pilotDistrict();
        $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified']);
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $this->access($field, 'admit', 'wrong-password')->assertStatus(422)->assertJsonPath('code', 'STEP_UP_REQUIRED');
        $this->access($field, 'admit', 'password', ['office_reference' => '  '])->assertStatus(422);
        $this->assertDatabaseMissing('district_memberships', ['user_id' => $field->id]);
        $this->assertDatabaseMissing('account_access_events', ['target_id' => $field->id]);
    }

    /** Proves: verified-email gating, non-admin denial and self-change bar are unchanged on the supported path. */
    public function test_email_gating_and_authority_bars_are_preserved(): void
    {
        $this->pilotDistrict();
        $unverified = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified', 'email_verified_at' => null]);
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web');
        $this->access($unverified, 'admit')->assertStatus(422)->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');
        $this->access($admin, 'admit')->assertStatus(422)->assertJsonPath('code', 'SELF_CHANGE_FORBIDDEN');

        $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified']);
        $this->app['auth']->forgetGuards();
        $this->actingAs(User::factory()->reviewer()->create(), 'web');
        $this->access($field, 'admit')->assertForbidden();
        $this->assertDatabaseMissing('district_memberships', ['user_id' => $field->id]);
    }

    /** Proves: a repeated idempotency key replays the receipt instead of reconciling twice. */
    public function test_same_idempotency_key_replays_without_a_second_event(): void
    {
        $this->pilotDistrict();
        $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified']);
        $this->actingAs(User::factory()->admin()->create(), 'web');
        $key = (string) Str::uuid();
        $version = $field->fresh()->access_version;

        $first = $this->access($field, 'admit', 'password', ['idempotency_key' => $key, 'expected_access_version' => $version])->assertOk()->json();
        $this->access($field, 'admit', 'password', ['idempotency_key' => $key, 'expected_access_version' => $version])->assertOk()->assertJsonPath('event_id', $first['event_id']);
        $this->assertSame(1, DB::table('account_access_events')->where('target_id', $field->id)->count());
    }

    private function access(User $target, string $operation, string $password = 'password', array $override = []): TestResponse
    {
        return $this->putJson('/api/v1/admin/accounts/'.$target->uuid.'/access', $override + [
            'contract_version' => 'accounts-access-v1', 'operation' => $operation,
            'desired' => ['role' => User::ROLE_FIELD_REPORTER, 'grants' => []], 'current_password' => $password,
            'office_reference' => 'synthetic', 'idempotency_key' => (string) Str::uuid(),
            'expected_access_version' => $target->fresh()->access_version,
        ]);
    }
}
