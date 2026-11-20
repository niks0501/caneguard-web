<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class BootstrapDeploymentTest extends TestCase
{
    use RefreshDatabase;

    private function configure(array $overrides = []): void
    {
        config($overrides + [
            'caneguard.pilot_district_code' => 'nasugbu-issuing',
            'caneguard.pilot_district_name' => 'Nasugbu Issuing District',
            'caneguard.bootstrap_admin.email' => '',
            'caneguard.bootstrap_admin.name' => '',
        ]);
    }

    public function test_creates_district_with_name_and_audit_row_then_repeats_as_a_no_op(): void
    {
        $this->configure();

        $this->artisan('caneguard:bootstrap')->assertSuccessful();
        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertSame(1, District::query()->count());
        $this->assertDatabaseHas('districts', ['code' => 'nasugbu-issuing', 'name' => 'Nasugbu Issuing District']);
        $this->assertSame(1, SecurityAudit::query()->where('action', SecurityAudit::ACTION_BOOTSTRAP_DISTRICT)->count());
        $this->assertSame(0, User::query()->count());
    }

    public function test_district_name_defaults_to_code_and_existing_names_are_kept(): void
    {
        $this->configure(['caneguard.pilot_district_name' => '']);
        $this->artisan('caneguard:bootstrap')->assertSuccessful();
        $this->assertDatabaseHas('districts', ['code' => 'nasugbu-issuing', 'name' => 'nasugbu-issuing']);

        $this->configure(['caneguard.pilot_district_name' => 'Renamed']);
        $this->artisan('caneguard:bootstrap')->assertSuccessful();
        $this->assertDatabaseHas('districts', ['code' => 'nasugbu-issuing', 'name' => 'nasugbu-issuing']);
    }

    public function test_blank_district_code_and_admin_email_change_nothing(): void
    {
        $this->configure(['caneguard.pilot_district_code' => '']);

        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertSame(0, District::query()->count());
        $this->assertSame(0, User::query()->count());
        $this->assertSame(0, SecurityAudit::query()->count());
    }

    public function test_creates_unverified_admin_without_district_and_sends_set_password_email_once_active(): void
    {
        Notification::fake();
        $this->configure(['caneguard.pilot_district_code' => '', 'caneguard.bootstrap_admin.email' => ' Owner@Example.Test ', 'caneguard.bootstrap_admin.name' => 'Owner']);

        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $admin = User::query()->where('email', 'owner@example.test')->firstOrFail();
        $this->assertSame(User::ROLE_ADMIN, $admin->role);
        $this->assertSame('Owner', $admin->name);
        $this->assertNull($admin->email_verified_at);
        Notification::assertSentToTimes($admin, ResetPassword::class, 1);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $admin->id, 'action' => 'account_created', 'outcome' => 'success']);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $admin->id, 'action' => 'account_invite_sent', 'outcome' => 'success']);
        $this->assertDatabaseCount('district_memberships', 0);

        // The administrator finishes the reset flow; later deploys leave them alone.
        $admin->forceFill(['email_verified_at' => now()])->save();
        $this->artisan('caneguard:bootstrap')->assertSuccessful();
        Notification::assertSentToTimes($admin, ResetPassword::class, 1);
        $this->assertSame(1, User::query()->count());
    }

    public function test_pending_admin_gets_a_fresh_link_on_the_next_run(): void
    {
        Notification::fake();
        $this->configure(['caneguard.bootstrap_admin.email' => 'owner@example.test']);

        $this->artisan('caneguard:bootstrap')->assertSuccessful();
        $this->travel(2)->minutes(); // past the reset-link throttle
        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $admin = User::query()->where('email', 'owner@example.test')->firstOrFail();
        Notification::assertSentToTimes($admin, ResetPassword::class, 2);
        $this->assertSame(1, User::query()->count());
    }

    public function test_existing_active_admin_blocks_a_new_bootstrap_admin(): void
    {
        Notification::fake();
        User::factory()->admin()->create(['email_verified_at' => now()]);
        $this->configure(['caneguard.bootstrap_admin.email' => 'owner@example.test']);

        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertDatabaseMissing('users', ['email' => 'owner@example.test']);
        Notification::assertNothingSent();
    }

    public function test_existing_non_admin_with_the_email_is_never_promoted(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'owner@example.test', 'role' => User::ROLE_REVIEWER, 'email_verified_at' => now()]);
        $this->configure(['caneguard.bootstrap_admin.email' => 'owner@example.test']);

        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertSame(User::ROLE_REVIEWER, $user->fresh()->role);
        Notification::assertNothingSent();
    }

    public function test_invalid_admin_email_fails_the_deploy_step(): void
    {
        $this->configure(['caneguard.bootstrap_admin.email' => 'not-an-email']);

        $this->artisan('caneguard:bootstrap')->assertFailed();

        $this->assertSame(0, User::query()->count());
    }

    public function test_failed_mail_does_not_fail_the_release_and_is_audited(): void
    {
        $this->configure(['caneguard.bootstrap_admin.email' => 'owner@example.test']);
        $this->app['events']->listen(
            NotificationSending::class,
            fn () => throw new \RuntimeException('mail down'),
        );

        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertDatabaseHas('users', ['email' => 'owner@example.test']);
        $this->assertDatabaseHas('security_audits', ['action' => 'account_invite_sent', 'outcome' => 'failure']);
    }

    public function test_scheduler_runs_both_prune_commands_daily_in_manila_time(): void
    {
        $events = collect($this->app->make(Schedule::class)->events());

        foreach (['auth:prune-security-audits', 'sanctum:prune-expired --hours=24'] as $command) {
            $event = $events->first(fn ($e) => str_contains($e->command, $command));
            $this->assertNotNull($event, "{$command} is not scheduled");
            $this->assertSame('Asia/Manila', (string) $event->timezone);
            $this->assertMatchesRegularExpression('/^\d+ \d+ \* \* \*$/', $event->expression);
        }
    }

    public function test_deploy_script_runs_bootstrap_after_migrate_and_ensures_the_scheduler_cron(): void
    {
        $script = (string) file_get_contents(base_path('../scripts/deploy-production.sh'));

        $migrate = strpos($script, 'artisan migrate --force');
        $bootstrap = strpos($script, 'artisan caneguard:bootstrap');
        $activate = strpos($script, 'mv -Tf "$root/.activate-$$"');
        $this->assertNotFalse($migrate);
        $this->assertGreaterThan($migrate, $bootstrap);
        $this->assertGreaterThan($bootstrap, $activate);
        $this->assertStringContainsString('artisan schedule:run', $script);
        $this->assertStringContainsString('# caneguard-scheduler', $script);
    }
}
