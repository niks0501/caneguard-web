<?php

namespace Tests\Feature;

use App\Models\AccountAccessEvent;
use App\Models\SecurityAudit;
use App\Models\User;
use App\Security\AccountsDirectory;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
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
        Artisan::call('auth:set-password-link', ['email' => $email]);
        $link = strtok(Artisan::output(), "\n");
        parse_str((string) parse_url((string) $link, PHP_URL_QUERY), $query);
        $this->assertSame('https://app.example.test/reset-password', strtok((string) $link, '?'));

        return ['token' => (string) $query['token'], 'email' => (string) $query['email']];
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
            ->assertOk()->assertJsonFragment(['action' => 'operator_link_issued']);

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

    public function test_operator_link_takes_its_target_from_env_when_no_email_is_typed(): void
    {
        $this->productionMail();
        $user = User::factory()->reviewer()->unverified()->create(['email' => 'env@example.test']);

        config(['caneguard.auth.operator_link_email' => 'ENV@example.test']);
        Artisan::call('auth:set-password-link');
        $this->assertStringStartsWith('https://app.example.test/reset-password?', (string) strtok(Artisan::output(), "\n"));
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $user->id, 'action' => 'operator_link_issued', 'outcome' => 'success']);

        config(['caneguard.auth.operator_link_email' => null]);
        $this->artisan('auth:set-password-link')->assertFailed();
    }

    public function test_operator_link_refuses_reset_urls_with_a_fragment_or_credentials(): void
    {
        $this->productionMail();
        User::factory()->reviewer()->unverified()->create(['email' => 'frag@example.test']);

        foreach (['https://app.example.test/reset-password#token', 'https://user:secret@app.example.test/reset-password'] as $url) {
            config(['caneguard.auth.password_reset_url' => $url]);
            $this->artisan('auth:set-password-link', ['email' => 'frag@example.test'])->assertFailed();
        }
        $this->assertDatabaseCount('password_reset_tokens', 0);
    }

    public function test_operator_link_refuses_accounts_that_completed_onboarding_and_unknown_emails(): void
    {
        $this->productionMail();
        User::factory()->reviewer()->create(['email' => 'done@example.test']);

        $this->artisan('auth:set-password-link', ['email' => 'done@example.test'])->assertFailed();
        $this->artisan('auth:set-password-link', ['email' => 'nobody@example.test'])->assertFailed();
        $this->assertDatabaseCount('password_reset_tokens', 0);
        $this->assertDatabaseMissing('security_audits', ['action' => 'operator_link_issued']);
    }

    public function test_operator_link_fails_before_replacing_a_token_when_the_reset_url_is_invalid(): void
    {
        $this->productionMail();
        User::factory()->reviewer()->unverified()->create(['email' => 'bad@example.test']);
        $query = $this->issueOperatorLink('bad@example.test');

        config(['caneguard.auth.password_reset_url' => 'http://app.example.test/reset-password']);
        $this->artisan('auth:set-password-link', ['email' => 'bad@example.test'])->assertFailed();

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

        $field->forceFill(['email_verified_at' => now()])->save();
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
