<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Symfony\Component\Mailer\Exception\TransportException;
use Tests\Support\CapturingSmtpTransport;
use Tests\TestCase;

class BootstrapDeploymentTest extends TestCase
{
    use RefreshDatabase;

    private ?string $originalPath = null;

    private ?string $fakeCrontabDir = null;

    protected function tearDown(): void
    {
        if ($this->originalPath !== null) {
            putenv('PATH='.$this->originalPath);
        }
        if ($this->fakeCrontabDir !== null) {
            (new \Symfony\Component\Process\Process(['rm', '-rf', $this->fakeCrontabDir]))->run();
        }
        parent::tearDown();
    }

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

        config(['mail.mailers.chain' => ['transport' => 'failover', 'mailers' => ['smtp', 'log']]]);
        foreach (['log', 'array', 'chain'] as $mailer) {
            $this->configure(['mail.default' => $mailer, 'caneguard.bootstrap_admin_email' => 'owner@example.test']);

            $this->artisan('caneguard:bootstrap')->assertFailed();
        }

        $this->assertSame(0, User::query()->count());
        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_CREATED)->count());
        Notification::assertNothingSent();
    }

    public function test_set_password_email_is_sent_only_after_the_account_is_committed(): void
    {
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);
        $outsideTransaction = DB::transactionLevel();
        $levelAtSend = null;
        $transport = $this->captureMail();
        $this->app['events']->listen(NotificationSending::class, function () use (&$levelAtSend): void {
            $levelAtSend = DB::transactionLevel();
        });

        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertSame($outsideTransaction, $levelAtSend);
        $this->assertDatabaseHas('users', ['email' => 'owner@example.test']);
        $this->assertSame(['owner@example.test'], $this->recipients($transport));
    }

    public function test_malformed_leftover_admin_email_does_not_block_a_deploy_with_an_active_admin(): void
    {
        Notification::fake();
        User::factory()->admin()->create(['email_verified_at' => now()]);
        $this->configure(['caneguard.bootstrap_admin_email' => 'not-an-email']);

        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertSame(1, User::query()->count());
        Notification::assertNothingSent();
    }

    public function test_redeemed_admin_whose_invite_record_is_missing_gets_no_fabricated_invitation(): void
    {
        Notification::fake();
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);
        $this->artisan('caneguard:bootstrap')->assertSuccessful();
        $admin = User::query()->where('email', 'owner@example.test')->firstOrFail();
        SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_INVITE)->delete();
        $admin->forceFill(['email_verified_at' => now()])->save();

        $this->travel(2)->minutes();
        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_INVITE)->count());
        Notification::assertSentToTimes($admin, ResetPassword::class, 1);
    }

    public function test_failed_send_keeps_the_committed_account_and_the_next_deploy_sends_the_link(): void
    {
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);
        $transport = $this->captureMail();
        $mailDown = true;
        $this->app['events']->listen(NotificationSending::class, function () use (&$mailDown): void {
            if ($mailDown) {
                throw new TransportException('mail down');
            }
        });

        $this->artisan('caneguard:bootstrap')->assertFailed();

        $this->assertDatabaseHas('users', ['email' => 'owner@example.test']);
        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_INVITE)
            ->where('outcome', SecurityAudit::OUTCOME_SUCCESS)->count());
        $this->assertSame(1, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_INVITE)
            ->where('outcome', SecurityAudit::OUTCOME_FAILURE)->count());
        $this->assertSame([], $this->recipients($transport));

        $mailDown = false;
        $this->travel(2)->minutes();
        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertSame(1, User::query()->count());
        $this->assertSame(1, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_INVITE)
            ->where('outcome', SecurityAudit::OUTCOME_SUCCESS)->count());
        $this->assertSame(['owner@example.test'], $this->recipients($transport));
    }

    public function test_mail_url_that_selects_a_log_transport_fails_before_creating_an_administrator(): void
    {
        Notification::fake();
        $this->configure(['mail.mailers.smtp.url' => 'log://default', 'caneguard.bootstrap_admin_email' => 'owner@example.test']);

        $this->artisan('caneguard:bootstrap')->assertFailed();

        $this->assertSame(0, User::query()->count());
        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_CREATED)->count());
        Notification::assertNothingSent();
    }

    public function test_smtp_scheme_the_transport_cannot_use_fails_before_creating_an_administrator(): void
    {
        Notification::fake();
        $this->configure(['mail.mailers.smtp.scheme' => 'log', 'caneguard.bootstrap_admin_email' => 'owner@example.test']);

        $this->artisan('caneguard:bootstrap')->assertFailed();

        $this->assertSame(0, User::query()->count());
        Notification::assertNothingSent();
    }

    public function test_undefined_mailer_fails_before_the_administrator_is_created(): void
    {
        Notification::fake();
        $this->configure(['mail.default' => 'typo', 'caneguard.bootstrap_admin_email' => 'owner@example.test']);

        $this->artisan('caneguard:bootstrap')->assertFailed();

        $this->assertSame(0, User::query()->count());
        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_CREATED)->count());
        Notification::assertNothingSent();
    }

    public function test_non_mail_failure_during_the_send_is_not_reported_as_a_mail_failure(): void
    {
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);
        $this->app['events']->listen(NotificationSending::class, function (): void {
            throw new \RuntimeException('database down');
        });

        $thrown = null;
        try {
            $this->artisan('caneguard:bootstrap')->run();
        } catch (\RuntimeException $e) {
            $thrown = $e;
        }

        $this->assertSame('database down', $thrown?->getMessage());
        $this->assertDatabaseHas('users', ['email' => 'owner@example.test']);
    }

    public function test_pending_admin_created_outside_bootstrap_is_not_taken_over(): void
    {
        Notification::fake();
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);
        User::factory()->admin()->create(['email' => 'owner@example.test', 'email_verified_at' => null]);

        $this->artisan('caneguard:bootstrap')->assertFailed();

        $this->assertSame(1, User::query()->count());
        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_INVITE)->count());
        Notification::assertNothingSent();
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
        $documented = ['auth:prune-security-audits' => '0 2 * * *', 'caneguard:prune-api-tokens' => '30 2 * * *'];

        foreach ($documented as $command => $expression) {
            $event = $events->first(fn ($e) => str_contains($e->command, $command));
            $this->assertNotNull($event, "{$command} is not scheduled");
            $this->assertSame('Asia/Manila', (string) $event->timezone);
            $this->assertSame($expression, $event->expression);
        }
    }

    public function test_failed_invite_audit_after_the_send_is_completed_by_the_next_deploy(): void
    {
        $this->configure(['caneguard.bootstrap_admin_email' => 'owner@example.test']);
        $transport = $this->captureMail();
        SecurityAudit::creating(function (SecurityAudit $audit): void {
            if ($audit->action === SecurityAudit::ACTION_ACCOUNT_INVITE) {
                throw new \RuntimeException('audit store down');
            }
        });

        $thrown = null;
        try {
            $this->artisan('caneguard:bootstrap')->run();
        } catch (\RuntimeException $e) {
            $thrown = $e;
        } finally {
            SecurityAudit::flushEventListeners();
        }

        $this->assertSame('audit store down', $thrown?->getMessage());
        $this->assertDatabaseHas('users', ['email' => 'owner@example.test']);
        $this->assertSame(['owner@example.test'], $this->recipients($transport));

        $this->travel(2)->minutes();
        $this->artisan('caneguard:bootstrap')->assertSuccessful();

        $this->assertSame(['owner@example.test', 'owner@example.test'], $this->recipients($transport));
        $this->assertSame(1, User::query()->count());
        $this->assertSame(1, SecurityAudit::query()->where('action', SecurityAudit::ACTION_ACCOUNT_INVITE)->count());
    }

    public function test_scheduler_entry_is_recorded_once_while_it_is_installed(): void
    {
        $entry = '* * * * * cd /var/www/caneguard/current/api && php artisan schedule:run >> /dev/null 2>&1 # caneguard-scheduler';
        $this->fakeCrontab("MAILTO=ops@example.test\n{$entry}\n");

        $this->artisan('caneguard:record-scheduler-install', ['cron_line' => $entry])->assertSuccessful();
        $this->artisan('caneguard:record-scheduler-install', ['cron_line' => $entry])->assertSuccessful();

        $this->assertSame([$entry], SecurityAudit::query()->where('action', SecurityAudit::ACTION_SCHEDULER_CRON_INSTALLED)
            ->get()->map(fn (SecurityAudit $row) => $row->metadata['cron_line'])->all());
    }

    public function test_scheduler_entry_absent_from_the_crontab_is_not_recorded(): void
    {
        $entry = '* * * * * cd /var/www/caneguard/current/api && php artisan schedule:run >> /dev/null 2>&1 # caneguard-scheduler';
        $this->fakeCrontab("0 3 * * * /usr/local/bin/backup.sh\n");

        $this->artisan('caneguard:record-scheduler-install', ['cron_line' => $entry])->assertFailed();

        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_SCHEDULER_CRON_INSTALLED)->count());
    }

    public function test_missing_crontab_records_nothing(): void
    {
        $this->fakeCrontab(null);

        $this->artisan('caneguard:record-scheduler-install', ['cron_line' => 'entry'])->assertFailed();

        $this->assertSame(0, SecurityAudit::query()->where('action', SecurityAudit::ACTION_SCHEDULER_CRON_INSTALLED)->count());
    }

    /** Routes the default mailer to an in-memory SMTP transport that records every message actually delivered to it. */
    private function captureMail(): CapturingSmtpTransport
    {
        $transport = new CapturingSmtpTransport();
        Mail::extend('smtp', fn () => $transport);
        config(['mail.default' => 'capture', 'mail.mailers.capture' => ['transport' => 'smtp']]);

        return $transport;
    }

    /** @return list<string> */
    private function recipients(CapturingSmtpTransport $transport): array
    {
        return collect($transport->sent)
            ->map(fn ($sent) => $sent->getOriginalMessage()->getTo()[0]->getAddress())
            ->values()
            ->all();
    }

    /** Puts a fake crontab first on PATH; a null body means no crontab is installed for the user. */
    private function fakeCrontab(?string $body): void
    {
        $dir = sys_get_temp_dir().'/caneguard-crontab-'.bin2hex(random_bytes(6));
        mkdir($dir, 0777, true);
        $store = $dir.'/crontab.txt';
        if ($body !== null) {
            file_put_contents($store, $body);
        }
        file_put_contents($dir.'/crontab', "#!/usr/bin/env bash\n[[ -f '{$store}' ]] || exit 1\ncat '{$store}'\n");
        chmod($dir.'/crontab', 0755);
        $this->originalPath ??= (string) getenv('PATH');
        putenv('PATH='.$dir.':'.$this->originalPath);
        $this->fakeCrontabDir = $dir;
    }
}
