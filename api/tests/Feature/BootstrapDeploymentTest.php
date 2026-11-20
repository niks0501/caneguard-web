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
            'caneguard.bootstrap_admin_email' => '',
            'mail.default' => 'smtp',
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

    public function test_existing_district_keeps_its_name(): void
    {
        $this->configure();
        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->configure(['caneguard.pilot_district_name' => 'Renamed']);
        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertDatabaseHas('districts', ['code' => 'nasugbu-issuing', 'name' => 'Nasugbu Issuing District']);
    }

    public function test_blank_district_code_or_name_fails_the_deploy_step_and_changes_nothing(): void
    {
        foreach (['caneguard.pilot_district_code', 'caneguard.pilot_district_name'] as $key) {
            $this->configure([$key => '']);

            $this->artisan('caneguard:bootstrap')->assertFailed();
        }

        $this->assertSame(0, District::query()->count());
        $this->assertSame(0, SecurityAudit::query()->count());
    }

    public function test_creates_admin_and_set_password_email_in_one_step_without_printing_the_address(): void
    {
        Notification::fake();
        $this->configure(['caneguard.bootstrap_admin_email' => ' Owner@Example.Test ']);

        $this->artisan('caneguard:bootstrap')
            ->doesntExpectOutputToContain('owner@example.test')
            ->assertSuccessful();

        $admin = User::query()->where('email', 'owner@example.test')->firstOrFail();
        $this->assertSame(User::ROLE_ADMIN, $admin->role);
        $this->assertSame('CaneGuard Administrator', $admin->name);
        $this->assertNull($admin->email_verified_at);
        Notification::assertSentToTimes($admin, ResetPassword::class, 1);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $admin->id, 'action' => 'account_created', 'outcome' => 'success']);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $admin->id, 'action' => 'account_invite_sent', 'outcome' => 'success']);
        $this->assertDatabaseCount('district_memberships', 0);
    }

    public function test_pending_admin_is_not_emailed_again_on_later_deploys(): void
    {
        Notification::fake();
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);

        $this->artisan('caneguard:bootstrap')->assertSuccessful();
        $this->travel(2)->minutes();
        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $admin = User::query()->where('email', 'owner@example.test')->firstOrFail();
        Notification::assertSentToTimes($admin, ResetPassword::class, 1);
        $this->assertSame(1, User::query()->count());
    }

    public function test_existing_active_admin_blocks_a_new_bootstrap_admin(): void
    {
        Notification::fake();
        User::factory()->admin()->create(['email_verified_at' => now()]);
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);

        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertDatabaseMissing('users', ['email' => 'owner@example.test']);
        Notification::assertNothingSent();
    }

    public function test_email_of_an_existing_account_fails_the_deploy_and_is_never_promoted(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'owner@example.test', 'role' => User::ROLE_REVIEWER, 'email_verified_at' => now()]);
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);

        $this->artisan('caneguard:bootstrap')->assertFailed();

        $this->assertSame(User::ROLE_REVIEWER, $user->fresh()->role);
        $this->assertSame(1, User::query()->count());
        Notification::assertNothingSent();
    }

    public function test_invalid_admin_email_fails_the_deploy_step(): void
    {
        $this->configure(['caneguard.bootstrap_admin_email' => 'not-an-email']);

        $this->artisan('caneguard:bootstrap')->assertFailed();

        $this->assertSame(0, User::query()->count());
    }

    public function test_log_or_array_mailer_fails_before_creating_an_administrator(): void
    {
        Notification::fake();

        foreach (['log', 'array'] as $mailer) {
            $this->configure(['mail.default' => $mailer, 'caneguard.bootstrap_admin_email' => 'owner@example.test']);

            $this->artisan('caneguard:bootstrap')->assertFailed();
        }

        $this->assertSame(0, User::query()->count());
        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_CREATED)->count());
        Notification::assertNothingSent();
    }

    public function test_failed_send_rolls_back_the_administrator_and_fails_the_deploy(): void
    {
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);
        $this->app['events']->listen(
            NotificationSending::class,
            fn () => throw new \RuntimeException('mail down'),
        );

        $this->artisan('caneguard:bootstrap')->assertFailed();

        $this->assertSame(0, User::query()->count());
        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_CREATED)->count());
        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_INVITE)->count());
    }

    public function test_bootstrap_admin_history_names_the_deployment_instead_of_an_administrator(): void
    {
        Notification::fake();
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);
        $this->artisan('caneguard:bootstrap')->assertSuccessful();
        $admin = User::query()->where('email', 'owner@example.test')->firstOrFail();
        $viewer = User::factory()->admin()->create(['email_verified_at' => now()]);

        $this->actingAs($viewer, 'web');
        $this->getJson('/api/v1/admin/accounts/'.$admin->uuid.'/events')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.actor_name', 'Deployment bootstrap')
            ->assertJsonPath('data.1.actor_name', 'Deployment bootstrap');
    }

    public function test_scheduler_runs_both_prune_commands_daily_in_manila_time(): void
    {
        $events = collect($this->app->make(Schedule::class)->events());

        foreach (['auth:prune-security-audits', 'caneguard:prune-api-tokens'] as $command) {
            $event = $events->first(fn ($e) => str_contains($e->command, $command));
            $this->assertNotNull($event, "{$command} is not scheduled");
            $this->assertSame('Asia/Manila', (string) $event->timezone);
            $this->assertMatchesRegularExpression('/^\d+ \d+ \* \* \*$/', $event->expression);
        }
    }

    public function test_scheduler_cron_install_is_recorded_in_the_audit(): void
    {
        $this->artisan('caneguard:record-scheduler-install')->assertSuccessful();

        $this->assertSame(1, SecurityAudit::query()->where('action', SecurityAudit::ACTION_SCHEDULER_CRON_INSTALLED)
            ->where('outcome', SecurityAudit::OUTCOME_SUCCESS)->count());
    }
}
