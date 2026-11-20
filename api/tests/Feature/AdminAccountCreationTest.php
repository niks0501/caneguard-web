<?php

namespace Tests\Feature;

use App\Actions\Auth\RecordSecurityAudit;
use App\Actions\Auth\ResendWebAccountInvite;
use App\Actions\Auth\ResetPasswordAction;
use App\Models\AccountAccessEvent;
use App\Models\SecurityAudit;
use App\Models\User;
use App\Security\AccountsDirectory;
use App\Support\MailDelivery;
use App\Support\RollbackBarrier;
use App\Support\RollbackInProgress;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeSmtpMailbox;
use Tests\TestCase;

class AdminAccountCreationTest extends TestCase
{
    use FakeSmtpMailbox;
    use RefreshDatabase;

    protected function tearDown(): void
    {
        $this->stopFakeMailbox();
        parent::tearDown();
    }

    private function productionMail(): void
    {
        $this->app['env'] = 'production';
        config([
            'mail.default' => 'smtp',
            'caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password',
        ]);
    }

    /** Web-form POST with a session CSRF token, as a browser would send it. */
    private function postWeb(string $uri, array $data): \Illuminate\Testing\TestResponse
    {
        return $this->withSession(['_token' => 'csrf-test-token'])
            ->withHeader('X-CSRF-TOKEN', 'csrf-test-token')
            ->postJson($uri, $data);
    }

    /** @return array{token: string, email: string} The query of the link the operator command printed. */
    private function issueOperatorLink(string $email): array
    {
        config(['caneguard.auth.operator_link_email' => $email]);
        Artisan::call('auth:set-password-link');
        $link = strtok(Artisan::output(), "\n");
        parse_str((string) parse_url((string) $link, PHP_URL_QUERY), $query);
        $this->assertSame('https://app.example.test/reset-password', strtok((string) $link, '?'));

        return ['token' => (string) $query['token'], 'email' => (string) $query['email']];
    }

    /**
     * Boots Artisan from a temporary root that shares this checkout's code and vendor but reads only its own .env, so
     * no developer dotenv file or inherited shell value can change what a subprocess sees.
     *
     * @param  array<string, string>  $env
     */
    private function isolatedApplication(array $env): string
    {
        $root = sys_get_temp_dir().'/caneguard-app-'.bin2hex(random_bytes(6));
        mkdir($root.'/bootstrap/cache', 0700, true);
        foreach (['framework/cache', 'framework/sessions', 'framework/views', 'logs'] as $directory) {
            mkdir($root.'/storage/'.$directory, 0700, true);
        }
        foreach (['app', 'config', 'database', 'resources', 'routes', 'vendor', 'composer.json'] as $entry) {
            symlink(base_path($entry), $root.'/'.$entry);
        }
        copy(base_path('artisan'), $root.'/artisan');
        copy(base_path('bootstrap/app.php'), $root.'/bootstrap/app.php');
        copy(base_path('bootstrap/providers.php'), $root.'/bootstrap/providers.php');
        $this->writeDotenv($root, $env);

        return $root;
    }

    /** @param  array<string, string>  $env */
    private function writeDotenv(string $root, array $env): void
    {
        file_put_contents($root.'/.env', implode("\n", array_map(fn ($key, $value): string => $key.'='.$value, array_keys($env), $env))."\n");
    }

    private function removeTree(string $path): void
    {
        if (is_link($path) || is_file($path)) {
            unlink($path);

            return;
        }
        if (! is_dir($path)) {
            return;
        }
        foreach (scandir($path) ?: [] as $entry) {
            if ($entry !== '.' && $entry !== '..') {
                $this->removeTree($path.'/'.$entry);
            }
        }
        rmdir($path);
    }

    private function payload(array $override = []): array
    {
        return array_merge(['name' => 'New Person', 'email' => 'New.Person@example.test', 'role' => 'reviewer', 'current_password' => 'password'], $override);
    }

    public function test_production_log_or_array_mailer_reports_invite_not_sent(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $this->app['env'] = 'production';
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web');

        foreach (['log', 'array'] as $i => $mailer) {
            config(['mail.default' => $mailer]);
            $email = "m{$i}@example.test";
            $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => $email, 'role' => 'field_reporter']))
                ->assertCreated()->assertJsonPath('invite_sent', false);
            $field = User::query()->where('email', $email)->firstOrFail();
            $this->travel(2)->minutes();
            $this->postJson('/api/v1/admin/accounts/'.$field->uuid.'/invite')->assertOk()->assertJsonPath('invite_sent', false);
            $this->assertDatabaseHas('security_audits', ['target_user_id' => $field->id, 'action' => 'account_invite_sent', 'outcome' => 'failure']);
        }
        Notification::assertNothingSent();
    }

    public function test_production_invite_is_reported_sent_only_when_the_smtp_mailbox_accepts_it(): void
    {
        $this->startFakeMailbox('smtp');
        $this->productionMail();
        $this->pilotDistrict();
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'real@example.test']))
            ->assertCreated()->assertJsonPath('invite_sent', true);

        $messages = $this->fakeMailboxMessages();
        $this->assertCount(1, $messages);
        $this->assertStringContainsString('real@example.test', (string) file_get_contents($messages[0]));
        $this->assertDatabaseHas('security_audits', ['action' => 'account_invite_sent', 'outcome' => 'success']);
    }

    public function test_production_invite_is_reported_not_sent_when_smtp_cannot_connect(): void
    {
        $this->productionMail();
        $this->pilotDistrict();
        config([
            'mail.mailers.smtp.scheme' => 'smtp',
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => $this->unusedPort(),
            'mail.mailers.smtp.require_tls' => true,
        ]);
        app('mail.manager')->forgetMailers();
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'refused@example.test']))
            ->assertCreated()->assertJsonPath('invite_sent', false);
        $user = User::query()->where('email', 'refused@example.test')->firstOrFail();
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $user->id, 'action' => 'account_invite_sent', 'outcome' => 'failure']);
    }

    public function test_operator_link_from_the_command_sets_the_password_once_and_is_audited(): void
    {
        $this->productionMail();
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'op@example.test']);

        $this->pilotDistrict();
        $query = $this->issueOperatorLink('OP@example.test');
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $user->id, 'action' => 'operator_link_issued', 'outcome' => 'success']);
        $this->assertDatabaseMissing('security_audits', ['target_user_id' => $user->id, 'action' => 'account_invite_sent']);
        $this->actingAs(User::factory()->admin()->create(), 'web')
            ->getJson('/api/v1/admin/accounts/'.$user->uuid.'/events')
            ->assertOk()->assertJsonMissing(['action' => 'operator_link_issued']);

        $this->postWeb('/reset-password', $query + ['password' => 'Str0ng-Passphrase!42', 'password_confirmation' => 'Str0ng-Passphrase!42'])->assertOk();
        $user->refresh();
        $this->assertTrue(Hash::check('Str0ng-Passphrase!42', $user->password));
        $this->assertNotNull($user->email_verified_at);

        $this->postWeb('/reset-password', $query + ['password' => 'Other-Passphrase!43', 'password_confirmation' => 'Other-Passphrase!43'])
            ->assertStatus(422);
        $this->assertTrue(Hash::check('Str0ng-Passphrase!42', $user->refresh()->password));
    }

    public function test_production_smtp_without_tls_reports_invite_not_sent_and_issues_no_token(): void
    {
        Notification::fake();
        $this->productionMail();
        config(['mail.mailers.smtp.require_tls' => false]);
        $this->pilotDistrict();
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'plain@example.test']))
            ->assertCreated()->assertJsonPath('invite_sent', false);
        Notification::assertNothingSent();
        $this->assertDatabaseCount('password_reset_tokens', 0);
    }

    public function test_failed_smtp_send_keeps_an_existing_operator_link_usable(): void
    {
        $this->productionMail();
        $this->pilotDistrict();
        $field = User::factory()->fieldReporter()->unverified()->create(['email' => 'field@example.test']);
        $query = $this->issueOperatorLink('field@example.test');

        $this->travel(2)->minutes();
        config([
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => $this->unusedPort(),
            'mail.mailers.smtp.require_tls' => true,
        ]);
        app('mail.manager')->forgetMailers();
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $this->postJson('/api/v1/admin/accounts/'.$field->uuid.'/invite')->assertOk()->assertJsonPath('invite_sent', false);
        $this->postWeb('/reset-password', $query + ['password' => 'Str0ng-Passphrase!42', 'password_confirmation' => 'Str0ng-Passphrase!42'])->assertOk();
        $this->assertTrue(Hash::check('Str0ng-Passphrase!42', $field->refresh()->password));
    }

    public function test_failed_send_neither_overwrites_a_later_link_nor_revives_a_used_one(): void
    {
        $this->productionMail();
        config(['mail.mailers.smtp.require_tls' => true]);
        User::factory()->reviewer()->unverified()->create(['email' => 'race@example.test']);
        User::factory()->reviewer()->unverified()->create(['email' => 'used@example.test']);

        $this->travel(2)->minutes();
        $superseded = $this->issueOperatorLink('race@example.test');
        $this->travel(2)->minutes();
        $later = null;
        Event::listen(NotificationSending::class, function () use (&$later): void {
            $later = $this->issueOperatorLink('race@example.test');
            throw new \RuntimeException('smtp unavailable');
        });
        $this->postWeb('/forgot-password', ['email' => 'race@example.test'])->assertAccepted();
        Event::forget(NotificationSending::class);
        $this->assertFalse($this->redeemsLink($superseded, 'Stale-Passphrase!41'));
        $this->assertTrue($this->redeemsLink($later, 'Newer-Passphrase!42'));

        $this->travel(2)->minutes();
        $pre = $this->issueOperatorLink('used@example.test');
        $this->travel(2)->minutes();
        $used = null;
        $intervening = null;
        Event::listen(NotificationSending::class, function () use (&$used, &$intervening): void {
            $used = $this->issueOperatorLink('used@example.test');
            $intervening = app(ResetPasswordAction::class)->handle(
                ['email' => $used['email'], 'token' => $used['token'], 'password' => 'Used-Passphrase!43', 'password_confirmation' => 'Used-Passphrase!43'],
                fn ($user, $password) => $user->forceFill(['password' => Hash::make($password)])->save(),
            );
            throw new \RuntimeException('smtp unavailable');
        });
        $this->postWeb('/forgot-password', ['email' => 'used@example.test'])->assertAccepted();
        Event::forget(NotificationSending::class);
        $this->assertSame(Password::PASSWORD_RESET, $intervening);
        $this->assertFalse($this->redeemsLink($pre, 'Revived-Passphrase!44'));
        $this->assertFalse($this->redeemsLink($used, 'Replayed-Passphrase!45'));
    }

    /** @param  array{token: string, email: string}  $link */
    private function redeemsLink(array $link, string $password): bool
    {
        $this->postWeb('/reset-password', $link + ['password' => $password, 'password_confirmation' => $password]);

        return Hash::check($password, User::query()->where('email', $link['email'])->firstOrFail()->password);
    }

    public function test_forgot_password_response_is_padded_to_the_recovery_timebox_for_unknown_addresses(): void
    {
        $this->productionMail();
        $contract = 'If an account matches, a password recovery link will be sent.';

        $started = hrtime(true);
        $this->postWeb('/forgot-password', ['email' => 'nobody-here@example.test'])->assertAccepted()->assertJsonPath('message', $contract);

        $this->assertGreaterThanOrEqual(0.2, (hrtime(true) - $started) / 1e9);
    }

    public function test_forgot_password_answers_the_contract_message_when_smtp_is_unreachable(): void
    {
        $this->productionMail();
        config([
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.port' => $this->unusedPort(),
            'mail.mailers.smtp.require_tls' => true,
        ]);
        app('mail.manager')->forgetMailers();
        User::factory()->reviewer()->create(['email' => 'known@example.test']);
        $contract = 'If an account matches, a password recovery link will be sent.';

        $this->postWeb('/forgot-password', ['email' => 'known@example.test'])->assertAccepted()->assertJsonPath('message', $contract);
        $this->postWeb('/forgot-password', ['email' => 'unknown@example.test'])->assertAccepted()->assertJsonPath('message', $contract);
    }

    public function test_operator_link_takes_its_target_from_env_when_no_email_is_typed(): void
    {
        $this->productionMail();
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'env@example.test']);

        config(['caneguard.auth.operator_link_email' => 'ENV@example.test']);
        Artisan::call('auth:set-password-link');
        $this->assertStringStartsWith('https://app.example.test/reset-password?', (string) strtok(Artisan::output(), "\n"));
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $user->id, 'action' => 'operator_link_issued', 'outcome' => 'success']);
        $this->assertNotEmpty(SecurityAudit::query()->where('target_user_id', $user->id)->where('action', 'operator_link_issued')->firstOrFail()->metadata['operator'] ?? null);

        config(['caneguard.auth.operator_link_email' => null]);
        $this->artisan('auth:set-password-link')->assertFailed();
    }

    public function test_operator_link_refuses_reset_urls_with_a_fragment_or_credentials(): void
    {
        $this->productionMail();
        User::factory()->reviewer()->unverified()->create(['email' => 'frag@example.test']);

        foreach (['https://app.example.test/reset-password#token', 'https://user:secret@app.example.test/reset-password'] as $url) {
            config(['caneguard.auth.password_reset_url' => $url, 'caneguard.auth.operator_link_email' => 'frag@example.test']);
            $this->artisan('auth:set-password-link')->assertFailed();
        }
        $this->assertDatabaseCount('password_reset_tokens', 0);

        // A query already on the configured URL is kept, but the issued token and address replace any it carries.
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password?token=stale&email=other@example.test&lang=en']);
        $link = $this->issueOperatorLink('frag@example.test');
        $this->assertSame('frag@example.test', $link['email']);
        $this->assertNotSame('stale', $link['token']);
    }

    public function test_operator_link_refuses_accounts_that_completed_onboarding_and_unknown_emails(): void
    {
        $this->productionMail();
        User::factory()->reviewer()->create(['email' => 'done@example.test'])->forceFill(['onboarded_at' => now()])->save();

        config(['caneguard.auth.operator_link_email' => 'done@example.test']);
        $this->artisan('auth:set-password-link')->assertFailed();
        config(['caneguard.auth.operator_link_email' => 'nobody@example.test']);
        $this->artisan('auth:set-password-link')->assertFailed();
        $this->assertDatabaseCount('password_reset_tokens', 0);
        $this->assertDatabaseMissing('security_audits', ['action' => 'operator_link_issued']);
    }

    /** Completes onboarding through the operator link, then changes the address through the account endpoint, which clears verification. */
    private function onboardThenChangeEmail(string $email): User
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password']);
        $this->pilotDistrict();
        $user = User::factory()->fieldReporter()->unverified()->create(['email' => $email]);
        $query = $this->issueOperatorLink($email);
        $this->postWeb('/reset-password', $query + ['password' => 'Str0ng-Passphrase!42', 'password_confirmation' => 'Str0ng-Passphrase!42'])->assertOk();

        $this->actingAs($user->refresh(), 'web')
            ->patchJson('/api/v1/auth/email', ['email' => 'changed-'.$email, 'current_password' => 'Str0ng-Passphrase!42'])
            ->assertStatus(202);
        $this->assertNull($user->refresh()->email_verified_at);

        return $user;
    }

    public function test_operator_link_refuses_an_onboarded_account_whose_new_email_is_unverified(): void
    {
        $user = $this->onboardThenChangeEmail('moved@example.test');

        config(['caneguard.auth.operator_link_email' => 'changed-moved@example.test']);
        $this->artisan('auth:set-password-link')->assertFailed();
        $this->assertDatabaseCount('password_reset_tokens', 0);
        $this->assertSame(1, SecurityAudit::query()->where('target_user_id', $user->id)->where('action', 'operator_link_issued')->count());
    }

    public function test_resend_refuses_an_onboarded_account_whose_new_email_is_unverified_even_when_mail_cannot_deliver(): void
    {
        $user = $this->onboardThenChangeEmail('resend@example.test');

        $this->productionMail();
        $status = app(ResendWebAccountInvite::class)->handle(User::factory()->admin()->create(), $user);
        $this->assertSame(MailDelivery::NOT_PENDING, $status);
        $this->assertDatabaseCount('password_reset_tokens', 0);
    }

    public function test_operator_link_still_refuses_an_onboarded_account_after_its_audits_are_pruned(): void
    {
        $user = $this->onboardThenChangeEmail('pruned@example.test');

        $this->travel(3000)->days();
        $this->artisan('auth:prune-security-audits')->assertSuccessful();
        $this->assertNotNull($user->refresh()->onboarded_at);

        config(['caneguard.auth.operator_link_email' => 'changed-pruned@example.test']);
        $this->artisan('auth:set-password-link')->assertFailed();
        $this->assertDatabaseCount('password_reset_tokens', 0);
    }

    public function test_field_directory_offers_no_invite_to_an_onboarded_account_with_a_changed_email(): void
    {
        $user = $this->onboardThenChangeEmail('directory@example.test');

        $this->actingAs(User::factory()->admin()->create(), 'web');
        $row = collect($this->getJson('/api/v1/admin/accounts/field')->assertOk()->json('data'))->firstWhere('uuid', $user->uuid);

        $this->assertIsArray($row);
        $this->assertFalse($row['invite_pending']);
        $this->assertFalse($row['email_verified']);
    }

    public function test_reset_link_issued_before_an_email_change_cannot_reset_a_new_account_at_the_old_address(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password']);
        Notification::fake();
        $this->pilotDistrict();
        $moved = User::factory()->reviewer()->create(['email' => 'vacated@example.test']);
        $this->postWeb('/forgot-password', ['email' => 'vacated@example.test'])->assertAccepted();
        $token = null;
        Notification::assertSentTo($moved, ResetPassword::class, function (ResetPassword $notification) use (&$token): bool {
            $token = $notification->token;

            return true;
        });

        $this->actingAs($moved->refresh(), 'web')
            ->patchJson('/api/v1/auth/email', ['email' => 'elsewhere@example.test', 'current_password' => 'password'])
            ->assertStatus(202);
        $newOwner = User::factory()->reviewer()->create(['email' => 'vacated@example.test']);

        $this->postWeb('/reset-password', ['token' => $token, 'email' => 'vacated@example.test', 'password' => 'Hijack-Passphrase!42', 'password_confirmation' => 'Hijack-Passphrase!42'])
            ->assertStatus(422);
        $this->assertTrue(Hash::check('password', $newOwner->refresh()->password));
    }

    public function test_documented_operator_invocation_reads_the_shared_env_target_and_leaves_the_cache_untouched(): void
    {
        $directory = sys_get_temp_dir().'/caneguard-operator-'.bin2hex(random_bytes(6));
        mkdir($directory, 0700);
        $database = $directory.'/database.sqlite';
        touch($database);
        $cache = $directory.'/config-cache.php';
        $absent = $directory.'/absent-config.php';
        $env = [
            'APP_ENV' => 'local',
            'DB_CONNECTION' => 'sqlite',
            'CACHE_STORE' => 'array',
            'CANEGUARD_PASSWORD_RESET_URL' => 'https://app.example.test/reset-password',
            'CANEGUARD_OPERATOR_LINK_EMAIL' => 'stale@example.test',
        ];
        $root = $this->isolatedApplication($env);
        $artisan = $root.'/artisan';
        $boot = fn (array $environment) => Process::env(array_merge(['DB_URL' => '', 'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => $database, 'APP_CONFIG_CACHE' => $absent], $environment));
        $operatorLinks = fn (): int => (int) (new \PDO('sqlite:'.$database))
            ->query("SELECT COUNT(*) FROM security_audits WHERE action = 'operator_link_issued'")->fetchColumn();

        try {
            $this->assertTrue($boot([])->run([PHP_BINARY, $artisan, 'migrate', '--force'])->successful());
            $this->assertTrue($boot([])->run([PHP_BINARY, $artisan, 'tinker', '--execute=App\\Models\\User::factory()->reviewer()->unverified()->create(["email" => "stale@example.test"]); App\\Models\\User::factory()->reviewer()->unverified()->create(["email" => "fresh@example.test"]);'])->successful());
            $this->assertTrue($boot(['APP_CONFIG_CACHE' => $cache])->run([PHP_BINARY, $artisan, 'config:cache'])->successful());
            $cachedDigest = hash_file('sha256', $cache);

            $this->writeDotenv($root, array_replace($env, ['CANEGUARD_OPERATOR_LINK_EMAIL' => 'fresh@example.test']));

            $ordinary = $boot(['APP_CONFIG_CACHE' => $cache])->run([PHP_BINARY, $artisan, 'auth:set-password-link']);
            $this->assertFalse($ordinary->successful());
            $this->assertSame(0, $operatorLinks());

            $documented = $boot(['APP_CONFIG_CACHE' => $absent, 'CANEGUARD_OPERATOR_LINK_EMAIL' => 'stale@example.test'])
                ->run(['env', '-u', 'CANEGUARD_OPERATOR_LINK_EMAIL', PHP_BINARY, $artisan, 'auth:set-password-link']);
            $this->assertTrue($documented->successful(), $documented->errorOutput());
            parse_str((string) parse_url((string) strtok($documented->output(), "\n"), PHP_URL_QUERY), $query);
            $this->assertSame('fresh@example.test', $query['email'] ?? null);
            $this->assertSame(1, $operatorLinks());
            $this->assertSame($cachedDigest, hash_file('sha256', $cache));
        } finally {
            $this->removeTree($root);
            $this->removeTree($directory);
        }
    }

    public function test_disabled_then_reenabled_pending_account_still_gets_the_operator_fallback(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password']);
        $pending = User::factory()->reviewer()->unverified()->create(['email' => 'toggled@example.test']);

        $pending->forceFill(['is_active' => false])->save();
        $pending->forceFill(['is_active' => true])->save();
        $this->artisan('auth:backfill-onboarding')->assertSuccessful();
        config(['caneguard.auth.operator_link_email' => 'toggled@example.test']);
        $this->artisan('auth:set-password-link')->assertSuccessful();

        $this->assertDatabaseHas('security_audits', ['target_user_id' => $pending->id, 'action' => 'operator_link_issued', 'outcome' => 'success']);
    }

    public function test_verified_account_without_password_or_evidence_stays_eligible_for_the_operator_fallback(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password']);
        $verifiedOnly = User::factory()->reviewer()->create([
            'email' => 'verify-only@example.test',
            'email_verified_at' => now(),
            'onboarded_at' => null,
        ]);
        $marked = User::factory()->reviewer()->create([
            'email' => 'marked@example.test',
            'email_verified_at' => now(),
            'onboarded_at' => now(),
        ]);
        $this->assertFalse($verifiedOnly->hasCompletedOnboarding());

        $query = $this->issueOperatorLink('verify-only@example.test');
        $this->assertSame('verify-only@example.test', $query['email']);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $verifiedOnly->id, 'action' => 'operator_link_issued']);

        config(['caneguard.auth.operator_link_email' => 'marked@example.test']);
        $this->artisan('auth:set-password-link')->assertFailed();
        $this->assertDatabaseMissing('security_audits', ['target_user_id' => $marked->id, 'action' => 'operator_link_issued']);
    }

    public function test_production_failover_mailer_is_never_reported_as_delivered(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $this->app['env'] = 'production';
        $this->actingAs(User::factory()->admin()->create(), 'web');
        config([
            'mail.default' => 'failover',
            'mail.mailers.failover' => ['transport' => 'failover', 'mailers' => ['smtp', 'log']],
        ]);

        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'failover@example.test', 'role' => 'field_reporter']))
            ->assertCreated()->assertJsonPath('invite_sent', false);
        Notification::assertNothingSent();
    }

    public function test_first_deploy_marks_only_positive_evidence_and_never_verification_alone(): void
    {
        $authorityOnly = User::factory()->reviewer()->unverified()->create(['email' => 'first-authority@example.test']);
        $authorityOnly->forceFill(['auth_version' => 2])->save();
        $verified = User::factory()->reviewer()->create(['email' => 'first-verified@example.test']);
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password', 'caneguard.auth.operator_link_email' => 'first-verified@example.test']);
        $passwordSet = User::factory()->reviewer()->unverified()->create(['email' => 'first-password@example.test']);
        $failedReset = User::factory()->reviewer()->unverified()->create(['email' => 'first-failed@example.test']);
        $record = app(RecordSecurityAudit::class);
        $record->handle(SecurityAudit::ACTION_PASSWORD_CHANGE, SecurityAudit::OUTCOME_SUCCESS, target: $passwordSet);
        $record->handle(SecurityAudit::ACTION_PASSWORD_RESET, SecurityAudit::OUTCOME_FAILURE, target: $failedReset);
        $emailChanged = User::factory()->reviewer()->unverified()->create(['email' => 'first-email-changed@example.test']);
        $record->handle(SecurityAudit::ACTION_EMAIL_CHANGE, SecurityAudit::OUTCOME_SUCCESS, target: $emailChanged);

        Schema::table('users', fn ($table) => $table->dropColumn('onboarded_at'));
        (require database_path('migrations/2026_11_20_000000_add_onboarded_at_to_users_table.php'))->up();
        $this->assertNull($verified->refresh()->onboarded_at);
        $this->artisan('auth:set-password-link')->assertSuccessful();

        $this->artisan('auth:backfill-onboarding')->assertSuccessful();

        $this->assertNull($authorityOnly->refresh()->onboarded_at);
        $this->assertNull($verified->refresh()->onboarded_at);
        $this->assertNotNull($passwordSet->refresh()->onboarded_at);
        $this->assertNull($failedReset->refresh()->onboarded_at);
        $this->assertNull($emailChanged->refresh()->onboarded_at);
    }

    public function test_reset_link_issued_for_a_previous_holder_cannot_reset_an_account_at_the_vacated_address(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password']);
        Notification::fake();
        $previous = User::factory()->reviewer()->create(['email' => 'holder-old@example.test']);
        $this->postWeb('/forgot-password', ['email' => 'holder-old@example.test'])->assertAccepted();
        $token = null;
        Notification::assertSentTo($previous, ResetPassword::class, function (ResetPassword $notification) use (&$token): bool {
            $token = $notification->token;

            return true;
        });
        DB::table('users')->where('id', $previous->id)->update(['email' => 'holder-new@example.test']);
        $newOwner = User::factory()->reviewer()->create(['email' => 'holder-old@example.test']);

        $this->postWeb('/reset-password', ['token' => $token, 'email' => 'holder-old@example.test', 'password' => 'Hijack-Passphrase!42', 'password_confirmation' => 'Hijack-Passphrase!42'])
            ->assertStatus(422);
        $this->assertTrue(Hash::check('password', $newOwner->refresh()->password));
    }

    public function test_pruning_drops_onboarding_evidence_once_the_account_is_marked(): void
    {
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'marked-prune@example.test']);
        app(RecordSecurityAudit::class)->handle(SecurityAudit::ACTION_PASSWORD_RESET, SecurityAudit::OUTCOME_SUCCESS, target: $user);
        $user->forceFill(['onboarded_at' => now()])->save();

        $this->travel(3000)->days();
        $this->artisan('auth:prune-security-audits')->assertSuccessful();

        $this->assertDatabaseMissing('security_audits', ['target_user_id' => $user->id]);
    }

    public function test_email_change_alone_does_not_complete_onboarding_for_the_operator_fallback(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password', 'caneguard.auth.operator_link_email' => 'late-evidence@example.test']);
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'late-evidence@example.test']);
        app(RecordSecurityAudit::class)->handle(SecurityAudit::ACTION_EMAIL_CHANGE, SecurityAudit::OUTCOME_SUCCESS, target: $user);

        $this->assertFalse($user->refresh()->hasCompletedOnboarding());
        $this->artisan('auth:set-password-link')->assertSuccessful();
    }

    public function test_public_signup_account_with_a_holder_chosen_password_completes_onboarding(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password', 'caneguard.auth.operator_link_email' => 'public-signup@example.test']);
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'public-signup@example.test', 'registration_origin' => 'public_signup']);

        $this->assertTrue($user->hasCompletedOnboarding());
        $this->artisan('auth:set-password-link')->assertFailed();
    }

    public function test_a_password_login_completes_onboarding_for_an_account_whose_history_was_pruned(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password', 'caneguard.auth.operator_link_email' => 'pruned-login@example.test']);
        $user = User::factory()->reviewer()->create(['email' => 'pruned-login@example.test']);
        $this->assertFalse($user->hasCompletedOnboarding());

        $this->postJson('/login', ['email' => 'pruned-login@example.test', 'password' => 'password'])->assertNoContent();

        $this->assertTrue($user->refresh()->hasCompletedOnboarding());
        $this->artisan('auth:set-password-link')->assertFailed();
    }

    public function test_onboarding_honors_a_password_reset_row_written_by_an_older_release_after_the_backfill(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password', 'caneguard.auth.operator_link_email' => 'delayed-write@example.test']);
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'delayed-write@example.test']);
        $this->artisan('auth:backfill-onboarding')->assertSuccessful();
        $this->assertNull($user->refresh()->onboarded_at);

        app(RecordSecurityAudit::class)->handle(SecurityAudit::ACTION_PASSWORD_RESET, SecurityAudit::OUTCOME_SUCCESS, target: $user);

        $this->assertTrue($user->refresh()->hasCompletedOnboarding());
        $this->artisan('auth:set-password-link')->assertFailed();
    }

    public function test_revoking_reset_links_before_a_rollback_invalidates_every_outstanding_link(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password']);
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'revoke-links@example.test']);
        $token = MailDelivery::issueToken($user);

        $this->artisan('auth:revoke-reset-links')->assertSuccessful();
        $this->postWeb('/reset-password', ['email' => 'revoke-links@example.test', 'token' => $token, 'password' => 'Revoked-Passphrase!42', 'password_confirmation' => 'Revoked-Passphrase!42'])
            ->assertStatus(422);
        $this->assertTrue(Hash::check('password', $user->refresh()->password));
    }

    public function test_rollback_barrier_refuses_invites_and_operator_links_until_it_is_released(): void
    {
        config([
            'caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password',
            'caneguard.auth.operator_link_email' => 'barrier@example.test',
        ]);
        Notification::fake();
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'barrier@example.test']);

        $this->artisan('auth:rollback-barrier on')->assertSuccessful();
        $refused = false;
        try {
            MailDelivery::sendInvite($user);
        } catch (RollbackInProgress) {
            $refused = true;
        }
        $this->assertTrue($refused);
        $this->artisan('auth:set-password-link')->assertFailed();
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'barrier@example.test']);
        $this->assertDatabaseMissing('security_audits', ['target_user_id' => $user->id, 'action' => 'operator_link_issued']);
        Notification::assertNothingSent();

        $this->artisan('auth:rollback-barrier off')->assertSuccessful();
        $this->assertSame(Password::RESET_LINK_SENT, MailDelivery::sendInvite($user));
        $this->artisan('auth:set-password-link')->assertSuccessful();
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $user->id, 'action' => 'operator_link_issued']);
    }

    public function test_rollback_barrier_command_rejects_an_unknown_state(): void
    {
        $this->artisan('auth:rollback-barrier maybe')->assertFailed();
        $this->assertFalse(Cache::has(RollbackBarrier::FLAG));
    }

    public function test_reset_response_is_padded_to_the_recovery_timebox_for_unknown_tokens(): void
    {
        $started = hrtime(true);
        $this->postWeb('/reset-password', ['email' => 'nobody-reset@example.test', 'token' => 'bogus', 'password' => 'Nobody-Passphrase!42', 'password_confirmation' => 'Nobody-Passphrase!42'])
            ->assertStatus(422)->assertJsonPath('code', 'INVALID_RESET_TOKEN');

        $this->assertGreaterThanOrEqual(0.2, (hrtime(true) - $started) / 1e9);
    }

    public function test_backfill_does_not_mark_an_account_whose_only_history_is_an_email_change(): void
    {
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'legacy-change@example.test']);
        app(RecordSecurityAudit::class)->handle(SecurityAudit::ACTION_EMAIL_CHANGE, SecurityAudit::OUTCOME_SUCCESS, target: $user);

        $this->artisan('auth:backfill-onboarding')->assertSuccessful();

        $this->assertNull($user->refresh()->onboarded_at);
    }

    public function test_pruning_keeps_successful_onboarding_evidence_and_drops_the_rest(): void
    {
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'retained@example.test']);
        $record = app(RecordSecurityAudit::class);
        $record->handle(SecurityAudit::ACTION_PASSWORD_RESET, SecurityAudit::OUTCOME_SUCCESS, target: $user);
        $record->handle(SecurityAudit::ACTION_EMAIL_VERIFICATION, SecurityAudit::OUTCOME_SUCCESS, target: $user);
        $record->handle(SecurityAudit::ACTION_PASSWORD_RESET, SecurityAudit::OUTCOME_FAILURE, target: $user);
        $record->handle(SecurityAudit::ACTION_ACCOUNT_INVITE, SecurityAudit::OUTCOME_SUCCESS, target: $user);

        $this->travel(3000)->days();
        $this->artisan('auth:prune-security-audits')->assertSuccessful();

        $this->assertSame(
            ['password_reset'],
            SecurityAudit::query()->orderBy('id')->pluck('action')->all(),
        );
    }

    public function test_invite_stays_bound_to_the_selected_account_when_its_address_is_reassigned(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password']);
        Notification::fake();
        $selected = User::factory()->fieldReporter()->unverified()->create(['email' => 'selected-old@example.test']);
        $stale = $selected->fresh();
        DB::table('users')->where('id', $selected->id)->update(['email' => 'selected-new@example.test']);
        User::factory()->reviewer()->unverified()->create(['email' => 'selected-old@example.test']);

        $status = MailDelivery::sendInvite($stale, User::ROLE_FIELD_REPORTER);

        $this->assertSame(Password::RESET_LINK_SENT, $status);
        $this->assertSame(1, DB::table('password_reset_tokens')->where('email', 'selected-new@example.test')->count());
        $this->assertSame(0, DB::table('password_reset_tokens')->where('email', 'selected-old@example.test')->count());
    }

    public function test_email_change_leaves_the_onboarding_marker_to_the_evidence_and_the_backfill(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password']);
        $legacy = User::factory()->reviewer()->create(['email' => 'legacy@example.test', 'onboarded_at' => now()]);
        $verifiedOnly = User::factory()->reviewer()->create(['email' => 'verify-only-change@example.test']);

        $this->actingAs($legacy, 'web')
            ->patchJson('/api/v1/auth/email', ['email' => 'legacy-new@example.test', 'current_password' => 'password'])
            ->assertStatus(202);
        $this->assertNotNull($legacy->refresh()->onboarded_at);
        config(['caneguard.auth.operator_link_email' => 'legacy-new@example.test']);
        $this->artisan('auth:set-password-link')->assertFailed();

        $this->actingAs($verifiedOnly, 'web')
            ->patchJson('/api/v1/auth/email', ['email' => 'verify-only-new@example.test', 'current_password' => 'password'])
            ->assertStatus(202);
        $this->assertNull($verifiedOnly->refresh()->onboarded_at);
        config(['caneguard.auth.operator_link_email' => 'verify-only-new@example.test']);
        $this->artisan('auth:set-password-link')->assertSuccessful();
    }

    public function test_recent_unbound_legacy_token_does_not_throttle_a_replacement_link(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password']);
        Notification::fake();
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'legacy-throttle@example.test']);
        DB::table('password_reset_tokens')->insert(['email' => $user->email, 'token' => Hash::make('legacy'), 'created_at' => now()]);

        $this->assertSame(Password::RESET_LINK_SENT, MailDelivery::sendResetLink($user->email));
        $this->assertSame(Password::RESET_THROTTLED, MailDelivery::sendResetLink($user->email));
    }

    public function test_backfill_marks_only_accounts_whose_history_records_a_password_set(): void
    {
        $pending = User::factory()->reviewer()->unverified()->create(['email' => 'pending-backfill@example.test']);
        $authorityOnly = User::factory()->reviewer()->unverified()->create(['email' => 'authority-backfill@example.test']);
        $authorityOnly->forceFill(['auth_version' => 2])->save();
        $reset = User::factory()->reviewer()->unverified()->create(['email' => 'reset-backfill@example.test']);
        app(RecordSecurityAudit::class)->handle(SecurityAudit::ACTION_PASSWORD_RESET, SecurityAudit::OUTCOME_SUCCESS, target: $reset);

        $this->artisan('auth:backfill-onboarding')->assertSuccessful();

        $this->assertNull($pending->refresh()->onboarded_at);
        $this->assertNull($authorityOnly->refresh()->onboarded_at);
        $this->assertNotNull($reset->refresh()->onboarded_at);
    }

    public function test_mail_require_tls_is_read_from_the_environment_on_a_fresh_boot(): void
    {
        $absent = sys_get_temp_dir().'/caneguard-mail-absent-'.bin2hex(random_bytes(4)).'.php';
        $root = $this->isolatedApplication(['APP_ENV' => 'local', 'CACHE_STORE' => 'array', 'MAIL_REQUIRE_TLS' => 'false']);

        try {
            foreach (['true' => true, 'false' => false] as $value => $expected) {
                $result = Process::env(['DB_URL' => '', 'DB_CONNECTION' => 'sqlite', 'APP_CONFIG_CACHE' => $absent, 'MAIL_REQUIRE_TLS' => $value])
                    ->run([PHP_BINARY, $root.'/artisan', 'tinker', '--execute=echo json_encode(config("mail.mailers.smtp.require_tls"));']);

                $this->assertTrue($result->successful(), $result->errorOutput());
                $this->assertSame($expected, json_decode(trim($result->output()), true));
            }
        } finally {
            $this->removeTree($root);
        }
    }

    public function test_production_invite_is_not_sent_through_a_relay_without_starttls(): void
    {
        $this->productionMail();
        $this->pilotDistrict();
        $port = $this->unusedPort();
        $log = sys_get_temp_dir().'/caneguard-plain-relay-'.bin2hex(random_bytes(4)).'.log';
        $relay = proc_open([PHP_BINARY, base_path('tests/Support/plain_smtp_relay.php'), (string) $port, $log], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);

        try {
            $this->assertSame("listening\n", fgets($pipes[1]));
            config([
                'mail.mailers.smtp.scheme' => 'smtp',
                'mail.mailers.smtp.host' => '127.0.0.1',
                'mail.mailers.smtp.port' => $port,
                'mail.mailers.smtp.require_tls' => true,
            ]);
            app('mail.manager')->forgetMailers();
            $this->actingAs(User::factory()->admin()->create(), 'web');

            $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'plain@example.test', 'role' => 'field_reporter']))
                ->assertCreated()->assertJsonPath('invite_sent', false);

            $sent = is_file($log) ? (string) file_get_contents($log) : '';
            $this->assertMatchesRegularExpression('/^EHLO /m', $sent);
            $this->assertMatchesRegularExpression('/^HELO /m', $sent);
            $this->assertDoesNotMatchRegularExpression('/^(AUTH|MAIL FROM|RCPT TO|DATA)/m', $sent);
        } finally {
            proc_terminate($relay);
            proc_close($relay);
            @unlink($log);
        }
    }

    public function test_operator_link_fails_before_replacing_a_token_when_the_reset_url_is_invalid(): void
    {
        $this->productionMail();
        User::factory()->reviewer()->unverified()->create(['email' => 'bad@example.test']);
        $query = $this->issueOperatorLink('bad@example.test');

        config(['caneguard.auth.password_reset_url' => 'http://app.example.test/reset-password']);
        $this->artisan('auth:set-password-link')->assertFailed();

        $this->postWeb('/reset-password', $query + ['password' => 'Str0ng-Passphrase!42', 'password_confirmation' => 'Str0ng-Passphrase!42'])->assertOk();
    }

    public function test_forgot_password_on_a_non_delivering_mailer_leaves_the_operator_link_usable(): void
    {
        $this->productionMail();
        config(['mail.default' => 'log']);
        User::factory()->reviewer()->unverified()->create(['email' => 'hold@example.test']);
        $query = $this->issueOperatorLink('hold@example.test');

        $this->travel(2)->minutes();
        $this->postWeb('/forgot-password', ['email' => 'hold@example.test'])->assertStatus(202)->assertJsonPath('code', 'PASSWORD_RESET_LINK_SENT');

        $this->postWeb('/reset-password', $query + ['password' => 'Str0ng-Passphrase!42', 'password_confirmation' => 'Str0ng-Passphrase!42'])->assertOk();
    }

    public function test_admin_creates_unverified_account_and_invite_audits_are_written(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web');

        $this->postJson('/api/v1/admin/accounts', $this->payload())->assertCreated()
            ->assertJsonPath('data.email', 'new.person@example.test')->assertJsonPath('data.role', 'reviewer')
            ->assertJsonPath('invite_sent', true)->assertJsonMissingPath('data.password');

        $user = User::query()->where('email', 'new.person@example.test')->firstOrFail();
        $this->assertNull($user->email_verified_at);
        Notification::assertSentTo($user, ResetPassword::class);
        $this->assertDatabaseHas('account_access_events', ['target_id' => $user->id, 'actor_id' => $admin->id, 'action' => 'create']);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $user->id, 'actor_id' => $admin->id, 'action' => 'account_created', 'outcome' => 'success']);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $user->id, 'action' => 'account_invite_sent', 'outcome' => 'success']);
        $this->assertDatabaseHas('security_audits', ['actor_id' => $admin->id, 'action' => 'step_up', 'outcome' => 'success']);
        $this->assertSame(1, AccountAccessEvent::query()->where('target_id', $user->id)->count());
    }

    public function test_field_reporter_receives_pilot_membership_and_admin_role_is_allowed(): void
    {
        Notification::fake();
        $district = $this->pilotDistrict();
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'f@example.test', 'role' => 'field_reporter']))->assertCreated();
        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'a@example.test', 'role' => 'admin']))->assertCreated();

        $field = User::query()->where('email', 'f@example.test')->firstOrFail();
        $this->assertDatabaseHas('district_memberships', ['user_id' => $field->id, 'district_id' => $district->id, 'revoked_at' => null]);
        $this->assertSame('admin', User::query()->where('email', 'a@example.test')->value('role'));
    }

    public function test_only_field_reporter_requires_a_configured_district(): void
    {
        Notification::fake();
        config(['caneguard.pilot_district_code' => '']);
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web');

        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'f@example.test', 'role' => 'field_reporter']))->assertStatus(503);
        $this->assertDatabaseMissing('users', ['email' => 'f@example.test']);

        foreach (['reviewer', 'admin', 'farmer'] as $role) {
            $email = "{$role}@example.test";
            $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => $email, 'role' => $role]))
                ->assertCreated()->assertJsonPath('invite_sent', true);
            $user = User::query()->where('email', $email)->firstOrFail();
            $this->assertDatabaseHas('security_audits', ['target_user_id' => $user->id, 'action' => 'account_created', 'outcome' => 'success']);
            $this->assertDatabaseHas('account_access_events', ['target_id' => $user->id, 'district_id' => null, 'action' => 'create']);
        }
        $this->assertDatabaseCount('account_access_events', 3);
        $this->assertDatabaseCount('district_memberships', 0);
    }

    public function test_role_allow_list_rejects_unknown_roles_and_extra_fields(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $this->actingAs(User::factory()->admin()->create(), 'web');

        foreach (['disabled', 'superuser', ''] as $role) {
            $this->postJson('/api/v1/admin/accounts', $this->payload(['role' => $role]))->assertUnprocessable();
        }
        $this->postJson('/api/v1/admin/accounts', $this->payload(['email_verified_at' => now()->toISOString()]))->assertUnprocessable();
        $this->postJson('/api/v1/admin/accounts', $this->payload(['is_active' => false]))->assertUnprocessable();
        $this->assertDatabaseMissing('users', ['email' => 'new.person@example.test']);
        Notification::assertNothingSent();
    }

    public function test_step_up_password_is_required_and_wrong_password_creates_nothing(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $without = $this->payload();
        unset($without['current_password']);
        $this->postJson('/api/v1/admin/accounts', $without)->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->postJson('/api/v1/admin/accounts', $this->payload(['current_password' => 'wrong-password']))
            ->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->assertDatabaseMissing('users', ['email' => 'new.person@example.test']);
        $this->assertDatabaseMissing('security_audits', ['action' => 'account_created']);
        $this->assertDatabaseHas('security_audits', ['action' => 'step_up', 'outcome' => 'failure']);
        Notification::assertNothingSent();
    }

    public function test_duplicate_email_returns_422_case_insensitively(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        User::factory()->reviewer()->create(['email' => 'taken@example.test']);
        $this->actingAs(User::factory()->admin()->create(), 'web');

        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'Taken@Example.test']))
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        Notification::assertNothingSent();
    }

    public function test_non_admins_unverified_admins_disabled_admins_and_bearer_tokens_get_403(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $admin = User::factory()->admin()->create();
        foreach ([User::factory()->reviewer()->create(), User::factory()->fieldReporter()->create(), User::factory()->farmer()->create(),
            User::factory()->admin()->unverified()->create(), User::factory()->admin()->create(['is_active' => false])] as $actor) {
            Auth::forgetGuards();
            $this->actingAs($actor, 'web');
            // A disabled identity is rejected at sign-in (401) or by the Admin gate (403); either way nothing is created.
            $this->assertContains($this->postJson('/api/v1/admin/accounts', $this->payload())->status(), [401, 403]);
            if ($actor->is_active) {
                $this->postJson('/api/v1/admin/accounts', $this->payload())->assertForbidden();
            }
        }
        Auth::forgetGuards();
        $this->withToken($admin->createToken('t', ['*'])->plainTextToken)->postJson('/api/v1/admin/accounts', $this->payload())->assertForbidden();
        $this->assertDatabaseMissing('users', ['email' => 'new.person@example.test']);
    }

    public function test_guest_cannot_create_accounts(): void
    {
        $this->postJson('/api/v1/admin/accounts', $this->payload())->assertUnauthorized();
    }

    public function test_completing_the_reset_link_sets_password_marks_email_verified_and_allows_sign_in(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $this->actingAs(User::factory()->admin()->create(), 'web');
        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'invitee@example.test']))->assertCreated();
        $user = User::query()->where('email', 'invitee@example.test')->firstOrFail();
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $n) use (&$token) {
            $token = $n->token;

            return true;
        });
        Auth::forgetGuards();

        $this->postWeb('/reset-password', ['email' => 'invitee@example.test', 'token' => $token,
            'password' => 'Str0ng-Passphrase!42', 'password_confirmation' => 'Str0ng-Passphrase!42'])->assertOk();

        $user->refresh();
        $this->assertNotNull($user->email_verified_at);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $user->id, 'action' => 'email_verification', 'outcome' => 'success']);
    }

    public function test_office_issued_farmer_sets_password_then_gets_account_security_only_mobile_token(): void
    {
        Notification::fake();
        $district = $this->pilotDistrict();
        $this->actingAs(User::factory()->admin()->create(), 'web');
        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'farmer@example.test', 'role' => 'farmer']))
            ->assertCreated()->assertJsonPath('data.role', 'farmer')->assertJsonPath('invite_sent', true);
        $farmer = User::query()->where('email', 'farmer@example.test')->firstOrFail();
        $this->assertNull($farmer->email_verified_at);
        $this->assertSame('office_certified', $farmer->registration_origin);
        $this->assertDatabaseMissing('district_memberships', ['user_id' => $farmer->id, 'district_id' => $district->id]);
        $token = null;
        Notification::assertSentTo($farmer, ResetPassword::class, function (ResetPassword $n) use (&$token) {
            $token = $n->token;

            return true;
        });
        Auth::forgetGuards();
        $this->postWeb('/reset-password', ['email' => 'farmer@example.test', 'token' => $token,
            'password' => 'Str0ng-Passphrase!42', 'password_confirmation' => 'Str0ng-Passphrase!42'])->assertOk();

        $this->postJson('/api/v1/mobile/auth/login', ['email' => 'farmer@example.test', 'password' => 'Str0ng-Passphrase!42',
            'device_name' => 'Farmer phone', 'device_id' => 'farmer-phone-1'])->assertOk()->assertJsonPath('user.role', 'farmer');
        $this->assertSame(['account:security'], $farmer->refresh()->tokens()->firstOrFail()->abilities);
    }

    public function test_office_issued_farmer_is_listed_for_office_triage(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $this->actingAs(User::factory()->admin()->create(), 'web');
        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'farmer@example.test', 'role' => 'farmer']))->assertCreated();
        $farmer = User::query()->where('email', 'farmer@example.test')->firstOrFail();

        $this->assertTrue(app(AccountsDirectory::class)->scope()->whereKey($farmer->id)->exists());
        $detail = app(AccountsDirectory::class)->detail($farmer, User::query()->where('role', 'admin')->firstOrFail());
        $this->assertSame('office_certified', $detail['origin']);
        $this->assertContains('keep_farmer', $detail['allowed_actions']);
    }

    public function test_public_registration_stays_disabled(): void
    {
        $this->postJson('/register', ['name' => 'X Y', 'email' => 'x@example.test', 'password' => 'Str0ng-Passphrase!42', 'password_confirmation' => 'Str0ng-Passphrase!42'])
            ->assertStatus(403)->assertJsonPath('code', 'REGISTRATION_DISABLED');
        $this->assertDatabaseMissing('users', ['email' => 'x@example.test']);
    }

    public function test_field_list_flags_pending_invite_and_admin_can_resend_the_link(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web');
        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'f@example.test', 'role' => 'field_reporter']))->assertCreated();
        $field = User::query()->where('email', 'f@example.test')->firstOrFail();

        $this->getJson('/api/v1/admin/accounts/field')->assertOk()->assertJsonPath('data.0.invite_pending', true);
        $this->postJson('/api/v1/admin/accounts/'.$field->uuid.'/invite')->assertStatus(429);
        $this->travel(2)->minutes();
        $this->postJson('/api/v1/admin/accounts/'.$field->uuid.'/invite')->assertOk()->assertJsonPath('invite_sent', true);
        Notification::assertSentToTimes($field, ResetPassword::class, 2);
        // creation invite, the throttled attempt (failure), and the delivered resend
        $this->assertSame(3, SecurityAudit::query()->where('target_user_id', $field->id)->where('action', 'account_invite_sent')->count());

        $field->forceFill(['email_verified_at' => now(), 'onboarded_at' => now()])->save();
        $this->getJson('/api/v1/admin/accounts/field')->assertJsonPath('data.0.invite_pending', false);
        $this->postJson('/api/v1/admin/accounts/'.$field->uuid.'/invite')->assertStatus(409);
    }

    public function test_resend_invite_is_admin_only_and_field_inspector_only(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $field = User::factory()->fieldReporter()->create(['email_verified_at' => null]);

        $this->actingAs(User::factory()->reviewer()->create(), 'web');
        $this->postJson('/api/v1/admin/accounts/'.$field->uuid.'/invite')->assertForbidden();
        Notification::assertNothingSent();
        $this->assertSame(0, SecurityAudit::query()->where('action', 'account_invite_sent')->count());
    }

    public function test_resend_invite_rejects_non_field_accounts(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $reviewer = User::factory()->reviewer()->create(['email_verified_at' => null]);

        $this->actingAs(User::factory()->admin()->create(), 'web');
        $this->postJson('/api/v1/admin/accounts/'.$reviewer->uuid.'/invite')->assertNotFound();
        Notification::assertNothingSent();
    }
}
