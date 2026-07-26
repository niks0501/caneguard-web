<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        $this->assertDatabaseHas('users', [
            'email' => 'mao@caneguard.test',
            'role' => User::ROLE_REVIEWER,
        ]);
        $this->assertDatabaseHas('users', [
            'email' => 'admin@caneguard.test',
            'role' => User::ROLE_ADMIN,
        ]);

        $expectedRoles = User::roles();
        sort($expectedRoles);

        $this->assertSame($expectedRoles, User::query()->pluck('role')->sort()->values()->all());
        $this->assertSame(3, User::query()->whereNotNull('uuid')->count());
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
    }
}
