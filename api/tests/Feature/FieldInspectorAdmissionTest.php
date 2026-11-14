<?php

namespace Tests\Feature;

use App\Models\DistrictMembership;
use App\Models\User;
use App\Security\DistrictAccess;
use Database\Seeders\AccountsSeeder;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Proposal tests (not proof): field inspectors can be admitted to the pilot
 * district end to end, while the existing denials stay in place.
 */
class FieldInspectorAdmissionTest extends TestCase
{
    use RefreshDatabase;

    private const LEGACY = 'Legacy or unsupported identity requires controlled operator reconciliation.';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
        ]);
    }

    /** Proves: the accounts seeder produces an assignable field account the office can admit. */
    public function test_accounts_seeder_field_account_is_offered_admission(): void
    {
        $this->pilotDistrict();
        $this->seed(AccountsSeeder::class);
        $field = User::query()->where('email', 'field@caneguard.test')->sole();
        $this->assertSame('office_certified', $field->registration_origin);
        $this->assertDatabaseCount('district_memberships', 0);

        $this->actingAs(User::query()->where('email', 'admin@caneguard.test')->sole(), 'web');
        $this->getJson('/api/v1/admin/accounts/field')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $field->uuid)->assertJsonPath('data.0.membership_state', 'not_issued')
            ->assertJsonPath('data.0.allowed_actions', ['admit'])->assertJsonPath('data.0.denial_reasons', []);
    }

    /** Proves: after the full demo seed, the office admits the field inspector and the phone gains visit refresh. */
    public function test_office_admits_the_seeded_field_inspector_and_the_phone_can_refresh_visits(): void
    {
        $district = $this->pilotDistrict();
        $this->seed(DatabaseSeeder::class);
        $field = User::query()->where('email', 'field@caneguard.test')->sole();
        $admin = User::query()->where('email', 'admin@caneguard.test')->sole();

        $before = $this->mobileLogin();
        $this->withToken($before)->getJson('/api/v1/mobile/assignments')->assertForbidden();
        $this->signOut();

        $this->actingAs($admin, 'web');
        $this->getJson('/api/v1/admin/accounts/field')->assertJsonPath('data.0.allowed_actions', ['admit']);
        $this->access($field, 'admit', 'admin-test-password')->assertOk()
            ->assertJsonPath('code', 'ACCOUNT_ACCESS_UPDATED')->assertJsonPath('data.role', 'field_reporter')
            ->assertJsonPath('data.is_active', true)->assertJsonPath('credentials_revoked', false);
        $this->assertDatabaseHas('district_memberships', ['user_id' => $field->id, 'district_id' => $district->id, 'revoked_at' => null]);
        $this->assertDatabaseHas('account_access_events', ['target_id' => $field->id, 'action' => 'admit']);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $field->id, 'action' => 'district_access_changed']);
        $this->getJson('/api/v1/admin/accounts/field')->assertJsonPath('data.0.membership_state', 'active')
            ->assertJsonPath('data.0.allowed_actions', ['revoke', 'replace']);
        $this->signOut();

        $this->assertTrue(app(DistrictAccess::class)->inspector($field->fresh()));
        $token = $this->mobileLogin();
        $this->withToken($token)->getJson('/api/v1/mobile/auth/me')->assertOk()
            ->assertJsonPath('user.capabilities', DistrictAccess::MOBILE_CAPABILITIES);
        $this->assertNotEmpty($this->withToken($token)->getJson('/api/v1/mobile/assignments')->assertOk()->json('data'));
    }

    /** Proves: admission issues membership only; it cannot promote the inspector to another role. */
    public function test_admission_cannot_change_the_inspector_role(): void
    {
        $this->pilotDistrict();
        $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified']);
        $this->actingAs(User::factory()->admin()->create(), 'web');

        foreach ([User::ROLE_ADMIN, User::ROLE_REVIEWER] as $role) {
            $this->access($field, 'admit', 'password', $role)->assertStatus(422)->assertJsonPath('code', 'INVALID_ACCESS_TRANSITION');
        }
        $this->assertDatabaseCount('district_memberships', 0);
        $this->assertSame(User::ROLE_FIELD_REPORTER, $field->fresh()->role);
    }

    /** Proves keep-list: legacy (unknown) and unsupported origins stay denied with the reconciliation reason. */
    public function test_legacy_and_unsupported_field_identities_stay_denied(): void
    {
        $this->pilotDistrict();
        $this->actingAs(User::factory()->admin()->create(), 'web');
        foreach (['unknown', 'public_signup', 'imported_roster'] as $origin) {
            $field = User::factory()->fieldReporter()->create(['registration_origin' => $origin]);
            $row = collect($this->getJson('/api/v1/admin/accounts/field')->assertOk()->json('data'))->firstWhere('uuid', $field->uuid);
            $this->assertSame([], $row['allowed_actions'], $origin);
            $this->assertSame([self::LEGACY], $row['denial_reasons'], $origin);
            $this->access($field, 'admit', 'password')->assertStatus(422)->assertJsonPath('code', 'INVALID_ACCESS_TRANSITION');
        }
        $this->assertDatabaseCount('district_memberships', 0);
    }

    /** Proves keep-list: a disabled office-certified inspector without membership is not admittable. */
    public function test_disabled_unassigned_inspector_stays_denied(): void
    {
        $this->pilotDistrict();
        $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified', 'is_active' => false]);
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $this->getJson('/api/v1/admin/accounts/field')->assertJsonPath('data.0.allowed_actions', [])
            ->assertJsonPath('data.0.denial_reasons', [self::LEGACY]);
        $this->access($field, 'admit', 'password')->assertStatus(422)->assertJsonPath('code', 'INVALID_ACCESS_TRANSITION');
    }

    /** Proves keep-list: an unverified inspector is explained, not admitted. */
    public function test_unverified_inspector_is_explained_and_cannot_be_admitted(): void
    {
        $this->pilotDistrict();
        $field = User::factory()->fieldReporter()->unverified()->create(['registration_origin' => 'office_certified']);
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $this->getJson('/api/v1/admin/accounts/field')->assertJsonPath('data.0.allowed_actions', [])
            ->assertJsonPath('data.0.denial_reasons', ['Email not verified. Staff issuance is unavailable.']);
        $this->access($field, 'admit', 'password')->assertStatus(422)->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');
        $this->assertDatabaseCount('district_memberships', 0);
    }

    /** Proves keep-list: a revoked inspector stays revoked; only restore is offered and admit is refused. */
    public function test_revoked_inspector_is_only_restorable(): void
    {
        $district = $this->pilotDistrict();
        $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified', 'is_active' => false]);
        DistrictMembership::create(['user_id' => $field->id, 'district_id' => $district->id, 'revoked_at' => now()]);
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $this->getJson('/api/v1/admin/accounts/field')->assertJsonPath('data.0.membership_state', 'revoked')
            ->assertJsonPath('data.0.allowed_actions', ['restore']);
        $this->access($field->fresh(), 'admit', 'password')->assertStatus(422)->assertJsonPath('code', 'INVALID_ACCESS_TRANSITION');
        $this->assertNotNull($field->districtMemberships()->sole()->revoked_at);
    }

    /** Proves keep-list: self-change stays barred, and only an admin can admit. */
    public function test_self_change_and_non_admin_admission_stay_barred(): void
    {
        $this->pilotDistrict();
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web');
        $this->access($admin, 'admit', 'password', User::ROLE_ADMIN)->assertStatus(422)->assertJsonPath('code', 'SELF_CHANGE_FORBIDDEN');

        $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified']);
        $this->signOut();
        $this->actingAs(User::factory()->reviewer()->create(), 'web');
        $this->access($field, 'admit', 'password')->assertForbidden();
        $this->assertDatabaseMissing('district_memberships', ['user_id' => $field->id]);
    }

    private function access(User $target, string $operation, string $password, string $role = User::ROLE_FIELD_REPORTER): TestResponse
    {
        return $this->putJson('/api/v2/admin/accounts/'.$target->uuid.'/access', [
            'contract_version' => 'accounts-access-v1', 'operation' => $operation,
            'desired' => ['role' => $role, 'grants' => []], 'current_password' => $password,
            'office_reference' => 'synthetic', 'idempotency_key' => (string) Str::uuid(),
            'expected_access_version' => $target->fresh()->access_version,
        ]);
    }

    /** Tests share one application, so drop the cached guard user and any bearer header between actors. */
    private function signOut(): void
    {
        $this->withoutToken();
        $this->app['auth']->forgetGuards();
    }

    private function mobileLogin(): string
    {
        return $this->postJson('/api/v1/mobile/auth/login', [
            'email' => 'field@caneguard.test', 'password' => 'field-test-password', 'device_name' => 'Test phone',
        ])->assertOk()->json('token');
    }
}
