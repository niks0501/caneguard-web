<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\DistrictMembership;
use App\Models\User;
use App\Security\DistrictAccess;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use LogicException;
use Tests\TestCase;

class DemoUserSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_fresh_demo_seed_restores_office_login_without_admitting_the_field_reporter(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => ' nasugbu-issuing ',
        ]);
        $this->seed(DatabaseSeeder::class);

        $district = District::query()->where('code', 'nasugbu-issuing')->sole();
        $access = app(DistrictAccess::class);
        foreach ([
            'mao@caneguard.test' => ['reviewer-test-password', User::ROLE_REVIEWER],
            'admin@caneguard.test' => ['admin-test-password', User::ROLE_ADMIN],
        ] as $email => [$password, $role]) {
            $user = User::query()->where('email', $email)->sole();
            $this->assertSame($role, $user->role);
            $this->assertDatabaseHas('district_memberships', [
                'user_id' => $user->id,
                'district_id' => $district->id,
                'revoked_at' => null,
            ]);
            $this->assertTrue($access->office($user));
            $this->postJson('/login', ['email' => $email, 'password' => $password])->assertNoContent();
            $this->assertAuthenticatedAs($user, 'web');
            $this->getJson('/api/v1/me')
                ->assertOk()
                ->assertJsonPath('data.role', $role)
                ->assertJsonPath('data.is_active', true)
                ->assertJsonMissingPath('data.district_id');
            $this->getJson('/api/v1/dashboard/summary')->assertOk();
            $this->postJson('/logout')->assertNoContent();
            Auth::forgetGuards();
            Auth::shouldUse('web');
        }

        $fieldReporter = User::query()->where('email', 'field@caneguard.test')->sole();
        $this->assertSame(User::ROLE_FIELD_REPORTER, $fieldReporter->role);
        $this->assertFalse($access->office($fieldReporter));
        $this->assertDatabaseMissing('district_memberships', ['user_id' => $fieldReporter->id]);
        $this->postJson('/login', [
            'email' => $fieldReporter->email,
            'password' => 'field-test-password',
        ])->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');
        $this->assertGuest('web');
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
        $this->assertSame('Existing pilot district', $district->fresh()->name);
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
            $this->assertTrue(app(DistrictAccess::class)->office($user));
            $user->forceFill(['is_active' => false])->save();
            $this->assertFalse(app(DistrictAccess::class)->office($user->fresh()));
        }
    }

    public function test_blank_pilot_configuration_aborts_seeding_with_the_missing_environment_key(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => ' ',
        ]);

        try {
            $this->seed(DatabaseSeeder::class);
            $this->fail('The seeder should reject a blank pilot district code.');
        } catch (LogicException $exception) {
            $this->assertSame(
                'Set CANEGUARD_PILOT_DISTRICT_CODE before seeding demo users.',
                $exception->getMessage(),
            );
        }

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('districts', 0);
        $this->assertDatabaseCount('district_memberships', 0);
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
