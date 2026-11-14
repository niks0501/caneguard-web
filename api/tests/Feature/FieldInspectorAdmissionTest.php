<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\DistrictGrant;
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
        $this->assertSame('unknown', User::query()->where('email', 'mao@caneguard.test')->sole()->registration_origin);
        $this->assertSame('unknown', User::query()->where('email', 'admin@caneguard.test')->sole()->registration_origin);
        $this->assertDatabaseCount('district_memberships', 0);

        $this->actingAs(User::query()->where('email', 'admin@caneguard.test')->sole(), 'web');
        $this->getJson('/api/v1/admin/accounts/field')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $field->uuid)->assertJsonPath('data.0.membership_state', 'not_issued')
            ->assertJsonPath('data.0.allowed_actions', ['admit'])->assertJsonPath('data.0.denial_reasons', []);
    }

    public function test_seeders_preserve_existing_office_account_origins(): void
    {
        $this->pilotDistrict();
        User::factory()->reviewer()->create(['email' => 'mao@caneguard.test', 'registration_origin' => 'public_signup']);
        User::factory()->admin()->create(['email' => 'admin@caneguard.test', 'registration_origin' => 'unknown']);

        foreach ([AccountsSeeder::class, DatabaseSeeder::class] as $seeder) {
            $this->seed($seeder);
            $this->assertSame('office_certified', User::query()->where('email', 'field@caneguard.test')->sole()->registration_origin);
            $this->assertSame('public_signup', User::query()->where('email', 'mao@caneguard.test')->sole()->registration_origin);
            $this->assertSame('unknown', User::query()->where('email', 'admin@caneguard.test')->sole()->registration_origin);
        }
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

    public function test_foreign_associations_prevent_inspector_admission(): void
    {
        $pilot = $this->pilotDistrict();
        $foreign = District::create(['code' => 'foreign', 'name' => 'Foreign']);
        $this->actingAs(User::factory()->admin()->create(), 'web');

        foreach ([DistrictMembership::class, DistrictGrant::class] as $model) {
            foreach ([null, now()] as $revokedAt) {
                $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified']);
                $attributes = ['user_id' => $field->id, 'district_id' => $foreign->id, 'revoked_at' => $revokedAt];
                if ($model === DistrictGrant::class) {
                    $attributes['ability'] = 'report:send';
                }
                $model::create($attributes);

                $row = collect($this->getJson('/api/v1/admin/accounts/field')->assertOk()->json('data'))->firstWhere('uuid', $field->uuid);
                $this->assertNotNull($row);
                $this->assertSame([], $row['allowed_actions']);
                $this->assertSame([self::LEGACY], $row['denial_reasons']);
                $this->access($field, 'admit', 'password')->assertStatus(422)->assertJsonPath('code', 'INVALID_ACCESS_TRANSITION');
                $this->assertDatabaseMissing('district_memberships', ['user_id' => $field->id, 'district_id' => $pilot->id]);
            }
        }
    }

    public function test_legacy_web_writers_cannot_adopt_foreign_associated_inspectors(): void
    {
        $pilot = $this->pilotDistrict();
        $foreign = District::create(['code' => 'foreign', 'name' => 'Foreign']);
        $this->actingAs(User::factory()->admin()->create(), 'web');

        foreach ([DistrictMembership::class, DistrictGrant::class] as $model) {
            foreach ([null, now()] as $revokedAt) {
                foreach ([false, true] as $restore) {
                    $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified']);
                    $attributes = ['user_id' => $field->id, 'district_id' => $foreign->id, 'revoked_at' => $revokedAt];
                    if ($model === DistrictGrant::class) {
                        $attributes['ability'] = 'report:send';
                    }
                    $model::create($attributes);
                    if ($restore) {
                        DistrictMembership::create(['user_id' => $field->id, 'district_id' => $pilot->id, 'revoked_at' => now()]);
                    }
                    $this->putJson('/api/v1/admin/users/'.$field->uuid.'/access', [
                        'current_password' => 'password', 'role' => User::ROLE_FIELD_REPORTER,
                        'grants' => [], 'revoke' => false, 'office_reference' => 'synthetic',
                    ])->assertStatus(422)->assertJsonPath('code', 'INVALID_ACCESS_TRANSITION');
                    $this->assertDatabaseMissing('district_memberships', ['user_id' => $field->id, 'district_id' => $pilot->id, 'revoked_at' => null]);
                }
            }
        }

        $farmer = User::factory()->farmer()->create();
        DistrictMembership::create(['user_id' => $farmer->id, 'district_id' => $foreign->id]);
        $this->patchJson('/api/v1/admin/users/'.$farmer->uuid.'/role', [
            'current_password' => 'password', 'role' => User::ROLE_FIELD_REPORTER, 'office_reference' => 'synthetic',
        ])->assertStatus(422)->assertJsonPath('code', 'INVALID_ACCESS_TRANSITION');
        $this->assertDatabaseMissing('district_memberships', ['user_id' => $farmer->id, 'district_id' => $pilot->id]);
        $this->assertSame(User::ROLE_FARMER, $farmer->fresh()->role);

        $unassigned = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified']);
        $this->putJson('/api/v1/admin/users/'.$unassigned->uuid.'/access', [
            'current_password' => 'password', 'role' => User::ROLE_FIELD_REPORTER,
            'grants' => [], 'revoke' => false, 'office_reference' => 'synthetic',
        ])->assertOk();
        $this->assertDatabaseHas('district_memberships', ['user_id' => $unassigned->id, 'district_id' => $pilot->id, 'revoked_at' => null]);
    }

    public function test_controlled_console_can_reconcile_foreign_associated_inspector(): void
    {
        $pilot = $this->pilotDistrict();
        $foreign = District::create(['code' => 'foreign', 'name' => 'Foreign']);
        $field = User::factory()->fieldReporter()->create(['registration_origin' => 'office_certified']);
        DistrictMembership::create(['user_id' => $field->id, 'district_id' => $foreign->id]);
        DistrictGrant::create(['user_id' => $field->id, 'district_id' => $foreign->id, 'ability' => 'report:send']);

        $this->artisan('caneguard:access', ['user' => $field->uuid, 'district' => $pilot->code, 'reference' => 'synthetic'])->assertExitCode(0);
        $this->assertDatabaseHas('district_memberships', ['user_id' => $field->id, 'district_id' => $pilot->id, 'revoked_at' => null]);
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
