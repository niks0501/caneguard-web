<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\AccountsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use LogicException;
use Tests\TestCase;

class AccountsSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => '',
        ]);
    }

    public function test_single_command_creates_only_three_verified_role_accounts_without_a_pilot_district(): void
    {
        $before = $this->nonAccountCounts();
        $this->artisan('db:seed', ['--class' => AccountsSeeder::class])->assertSuccessful();

        $this->assertDatabaseCount('users', 3);
        foreach ([
            'field@caneguard.test' => ['Arnel Mercado', 'field_reporter', 'field-test-password'],
            'mao@caneguard.test' => ['Liza Mae Navarro', 'reviewer', 'reviewer-test-password'],
            'admin@caneguard.test' => ['Crisanto de Vera', 'admin', 'admin-test-password'],
        ] as $email => [$name, $role, $password]) {
            $user = User::query()->where('email', $email)->sole();
            $this->assertSame($name, $user->name);
            $this->assertSame($role, $user->role);
            $this->assertTrue($user->hasVerifiedEmail());
            $this->assertTrue($user->is_active);
            $this->assertTrue(Hash::check($password, $user->password));
        }
        $this->assertSame($before, $this->nonAccountCounts());
    }

    public function test_rerun_refreshes_accounts_and_passwords_without_duplicates_or_touching_unrelated_users(): void
    {
        $other = User::factory()->create();
        $original = $other->fresh()->getRawOriginal();
        $this->seed(AccountsSeeder::class);
        $ids = User::query()->orderBy('id')->pluck('uuid', 'email')->all();
        DB::table('users')->where('email', 'mao@caneguard.test')->update([
            'name' => 'Changed', 'role' => 'farmer', 'email_verified_at' => null,
        ]);
        config(['caneguard.demo_users.reviewer_password' => 'rotated-reviewer-password']);

        $this->seed(AccountsSeeder::class);

        $this->assertSame($ids, User::query()->orderBy('id')->pluck('uuid', 'email')->all());
        $reviewer = User::query()->where('email', 'mao@caneguard.test')->sole();
        $this->assertSame('Liza Mae Navarro', $reviewer->name);
        $this->assertSame('reviewer', $reviewer->role);
        $this->assertTrue($reviewer->hasVerifiedEmail());
        $this->assertTrue(Hash::check('rotated-reviewer-password', $reviewer->password));
        $this->assertFalse(Hash::check('reviewer-test-password', $reviewer->password));
        $this->assertSame($original, $other->fresh()->getRawOriginal());
    }

    public function test_each_missing_or_empty_password_rejects_the_command_before_any_accounts_are_written(): void
    {
        foreach (['field_reporter_password', 'reviewer_password', 'admin_password'] as $key) {
            foreach ([null, ''] as $value) {
                $configKey = 'caneguard.demo_users.'.$key;
                $original = config($configKey);
                config([$configKey => $value]);
                try {
                    $this->seed(AccountsSeeder::class);
                    $this->fail('Missing credentials must abort seeding.');
                } catch (LogicException $exception) {
                    $this->assertStringContainsString('CANEGUARD_*_PASSWORD', $exception->getMessage());
                } finally {
                    config([$configKey => $original]);
                }
                $this->assertDatabaseCount('users', 0);
            }
        }
    }

    public function test_production_refuses_even_a_forced_seed_without_writing_accounts(): void
    {
        $this->app->instance('env', 'production');
        try {
            $this->artisan('db:seed', ['--class' => AccountsSeeder::class, '--force' => true])->run();
            $this->fail('Production must refuse seeding.');
        } catch (LogicException $exception) {
            $this->assertSame('AccountsSeeder refuses to run in production.', $exception->getMessage());
        } finally {
            $this->app->instance('env', 'testing');
        }
        $this->assertDatabaseCount('users', 0);
    }

    private function nonAccountCounts(): array
    {
        $counts = [];
        foreach (DB::select("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('users', 'sqlite_sequence') ORDER BY name") as $table) {
            $counts[$table->name] = DB::table($table->name)->count();
        }

        return $counts;
    }
}
