<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\DistrictMembership;
use App\Models\User;
use App\Security\DistrictAccess;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use LogicException;
use Tests\TestCase;

class DemoUserSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_users_are_seeded_with_the_canonical_roles(): void
    {
        Storage::fake('local');

        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
        ]);

        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseHas('users', [
            'email' => 'field@caneguard.test',
            'role' => User::ROLE_FIELD_REPORTER,
        ]);
        $this->assertNotNull(User::query()->where('email', 'field@caneguard.test')->value('email_verified_at'));
        $this->assertDatabaseHas('users', [
            'email' => 'mao@caneguard.test',
            'role' => User::ROLE_REVIEWER,
        ]);
        $this->assertDatabaseHas('users', [
            'email' => 'admin@caneguard.test',
            'role' => User::ROLE_ADMIN,
        ]);
        $this->assertDatabaseMissing('users', ['role' => 'expert']);

        // The demo seeds staff identities only, never farmer sign-up or capability grants.
        $expectedRoles = [User::ROLE_FIELD_REPORTER, User::ROLE_REVIEWER, User::ROLE_ADMIN];
        sort($expectedRoles);

        $this->assertSame($expectedRoles, User::query()->pluck('role')->sort()->values()->all());
        $this->assertSame(3, User::query()->whereNotNull('uuid')->count());
        $this->assertDatabaseCount('reports', 0);
    }

    public function test_fresh_demo_seed_restores_office_login_without_admitting_the_field_reporter(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => ' demo-pilot ',
        ]);
        $this->assertDatabaseCount('districts', 0);
        $this->assertDatabaseCount('district_memberships', 0);

        $this->seed(DatabaseSeeder::class);

        $district = District::query()->where('code', 'demo-pilot')->sole();
        $access = app(DistrictAccess::class);
        foreach (['mao@caneguard.test' => 'reviewer-test-password', 'admin@caneguard.test' => 'admin-test-password'] as $email => $password) {
            $user = User::query()->where('email', $email)->sole();
            $this->assertDatabaseHas('district_memberships', [
                'user_id' => $user->id,
                'district_id' => $district->id,
                'revoked_at' => null,
            ]);
            $this->assertTrue($access->office($user));
            $this->postJson('/login', ['email' => $email, 'password' => $password])->assertNoContent();
            $this->assertAuthenticatedAs($user, 'web');
            $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.district_id', $district->id);
            $this->getJson('/api/v1/dashboard/summary')->assertOk();
            $this->postJson('/logout')->assertNoContent();
            Auth::forgetGuards();
            Auth::shouldUse('web');
        }

        $fieldReporter = User::query()->where('email', 'field@caneguard.test')->sole();
        $this->assertFalse($access->office($fieldReporter));
        $this->assertDatabaseMissing('district_memberships', ['user_id' => $fieldReporter->id]);
        $this->postJson('/login', [
            'email' => $fieldReporter->email,
            'password' => 'field-test-password',
        ])->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');
        $this->assertGuest('web');
        $this->assertDatabaseCount('district_memberships', 2);
        $this->assertDatabaseCount('district_grants', 0);
    }

    public function test_office_demo_memberships_are_idempotent_and_reuse_the_configured_district(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => 'demo-pilot',
        ]);
        $district = District::query()->create(['code' => 'demo-pilot', 'name' => 'Existing pilot district']);

        $this->seed(DatabaseSeeder::class);
        $memberships = DistrictMembership::query()->orderBy('id')->get()->toArray();
        $this->seed(DatabaseSeeder::class);

        $this->assertSame($memberships, DistrictMembership::query()->orderBy('id')->get()->toArray());
        $this->assertDatabaseCount('district_memberships', 2);
        $this->assertDatabaseCount('districts', 1);
        $this->assertSame('Existing pilot district', $district->fresh()->name);
        $this->assertDatabaseCount('users', 3);
        $this->assertDatabaseCount('district_grants', 0);
    }

    public function test_demo_seed_does_not_restore_revoked_office_memberships(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => 'demo-pilot',
        ]);
        $this->seed(DatabaseSeeder::class);
        DistrictMembership::query()->update(['revoked_at' => now()]);
        $memberships = DistrictMembership::query()->orderBy('id')->get()->toArray();

        $this->seed(DatabaseSeeder::class);

        $this->assertSame($memberships, DistrictMembership::query()->orderBy('id')->get()->toArray());
        foreach (User::query()->whereIn('role', User::officeRoles())->get() as $user) {
            $this->assertFalse(app(DistrictAccess::class)->office($user));
        }
    }

    public function test_blank_pilot_configuration_does_not_manufacture_district_access(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => ' ',
        ]);

        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount('districts', 0);
        $this->assertDatabaseCount('district_memberships', 0);
        foreach (User::query()->whereIn('role', User::officeRoles())->get() as $user) {
            $this->assertFalse(app(DistrictAccess::class)->office($user));
        }
    }

    public function test_demo_users_require_local_password_configuration(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => null,
            'caneguard.demo_users.reviewer_password' => null,
            'caneguard.demo_users.admin_password' => null,
        ]);

        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('Set all CANEGUARD_*_PASSWORD values');

        $this->seed(DatabaseSeeder::class);
    }

    public function test_demo_user_validation_happens_before_any_users_are_written(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => null,
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => 'demo-pilot',
        ]);

        try {
            $this->seed(DatabaseSeeder::class);
            $this->fail('The seeder should reject incomplete demo credentials.');
        } catch (LogicException $exception) {
            $this->assertSame(
                'Set all CANEGUARD_*_PASSWORD values before seeding demo users.',
                $exception->getMessage(),
            );
        }

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('districts', 0);
        $this->assertDatabaseCount('district_memberships', 0);
    }
}
