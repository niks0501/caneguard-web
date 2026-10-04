<?php

namespace Tests\Feature;

use App\Models\DistrictGrant;
use App\Models\Report;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_registration_is_disabled_without_creating_an_account(): void
    {
        config(['caneguard.self_registration_enabled' => false]);

        $this->postJson('/register', [
            'name' => 'Unauthorized Field Inspector',
            'email' => 'unauthorized@example.test',
            'password' => 'A safe field reporter passphrase',
        ])->assertForbidden()->assertExactJson([
            'message' => 'Public self-registration is disabled. Contact your CaneGuard administrator to request an authorized account.',
            'code' => 'REGISTRATION_DISABLED',
        ]);

        $this->assertDatabaseMissing('users', ['email' => 'unauthorized@example.test']);
        $this->assertDatabaseCount('security_audits', 0);
    }

    public function test_registration_creates_only_a_verified_email_gated_farmer(): void
    {
        config(['caneguard.self_registration_enabled' => true, 'caneguard.pilot_roster_certified' => true]);
        Notification::fake();

        $response = $this->postJson('/register', [
            'name' => 'New Field Reporter',
            'email' => 'NEW@EXAMPLE.TEST',
            'password' => 'A safe field reporter passphrase',
            'role' => User::ROLE_ADMIN,
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('code', 'REGISTRATION_CREATED')
            ->assertJsonPath('user.role', User::ROLE_FARMER)
            ->assertJsonPath('user.email_verified', false);

        $user = User::query()->where('email', 'new@example.test')->sole();
        $this->assertNull($user->email_verified_at);
        $this->assertTrue(Hash::check('A safe field reporter passphrase', $user->password));
        $this->assertGuest();
        Notification::assertSentTo($user, VerifyEmail::class);
        $this->assertDatabaseHas('security_audits', [
            'action' => SecurityAudit::ACTION_REGISTRATION,
            'outcome' => SecurityAudit::OUTCOME_SUCCESS,
            'target_user_id' => $user->getKey(),
        ]);
    }

    public function test_unverified_users_cannot_use_web_or_mobile_authentication(): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->unverified()->fieldReporter()->create([
            'password' => 'A safe field reporter passphrase',
        ]);

        $this->postJson('/login', [
            'email' => $user->email,
            'password' => 'A safe field reporter passphrase',
        ])->assertForbidden()->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');

        $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $user->email,
            'password' => 'A safe field reporter passphrase',
            'device_name' => 'Test Android',
        ])->assertForbidden()->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');

        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertGuest();

        $token = $user->createToken('unverified-test')->plainTextToken;
        $this->withToken($token)
            ->getJson('/api/v1/mobile/auth/me')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_signed_email_verification_is_idempotent_and_enables_authentication(): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->unverified()->reviewer()->create([
            'password' => 'A safe reviewer passphrase',
        ]);
        $url = URL::temporarySignedRoute(
            'verification.verify',
            now()->addHour(),
            ['id' => $user->getKey(), 'hash' => sha1($user->email)],
        );

        $this->getJson(parse_url($url, PHP_URL_PATH).'?'.parse_url($url, PHP_URL_QUERY))
            ->assertOk()
            ->assertJsonPath('code', 'EMAIL_VERIFIED');
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->postJson('/login', [
            'email' => $user->email,
            'password' => 'A safe reviewer passphrase',
        ])->assertNoContent();
        $this->assertAuthenticatedAs($user);
        $this->postJson('/logout')->assertNoContent();
        $this->getJson(parse_url($url, PHP_URL_PATH).'?'.parse_url($url, PHP_URL_QUERY))
            ->assertOk()
            ->assertJsonPath('code', 'EMAIL_VERIFIED');
    }

    public function test_generated_api_asset_urls_are_host_independent_and_app_relative(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create();
        Sanctum::actingAs($reviewer);

        $localhostResponse = $this->withHeader('Host', 'localhost:8000')
            ->getJson('/api/v1/reports?per_page=1')
            ->assertOk();
        $lanResponse = $this->withHeader('Host', '192.168.1.42:8000')
            ->getJson('/api/v1/reports?per_page=1')
            ->assertOk();

        $imagePath = '/api/v1/reports/'.$report->uuid.'/image';
        $this->assertSame($imagePath, $localhostResponse->json('data.0.image_url'));
        $this->assertSame(
            $localhostResponse->json('data.0.image_url'),
            $lanResponse->json('data.0.image_url'),
        );
    }

    public function test_spoofed_host_cannot_change_signed_verification_links(): void
    {
        Notification::fake();
        $user = User::factory()->inDistrict($this->pilotDistrict())->unverified()->create();

        $this->withHeader('Host', 'attacker.example.test')
            ->postJson('/email/verification-notification', ['email' => $user->email])
            ->assertAccepted();

        $query = null;
        Notification::assertSentTo($user, VerifyEmail::class, function (VerifyEmail $notification) use (&$query, $user): bool {
            $linkQuery = parse_url((string) $notification->toMail($user)->actionUrl, PHP_URL_QUERY);
            if (! is_string($linkQuery) || $linkQuery === '') {
                return false;
            }

            parse_str($linkQuery, $parameters);
            if (! isset($parameters['expires'], $parameters['signature'])) {
                return false;
            }

            $query = http_build_query([
                'expires' => $parameters['expires'],
                'signature' => $parameters['signature'],
            ], '', '&', PHP_QUERY_RFC3986);

            return true;
        });

        $this->withHeader('Host', 'localhost')
            ->getJson('/email/verify/'.$user->getKey().'/'.sha1($user->email).'?'.$query)
            ->assertOk()
            ->assertJsonPath('code', 'EMAIL_VERIFIED');
    }

    public function test_invalid_email_verification_signatures_use_the_generic_link_error(): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->unverified()->create();

        $this->getJson('/email/verify/'.$user->getKey().'/'.sha1($user->email).'?expires=9999999999&signature=invalid')
            ->assertForbidden()
            ->assertJsonPath('code', 'INVALID_VERIFICATION_LINK');
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_verification_resend_is_generic_and_throttled(): void
    {
        Notification::fake();
        $user = User::factory()->inDistrict($this->pilotDistrict())->unverified()->create();

        $known = $this->postJson('/email/verification-notification', ['email' => $user->email]);
        $unknown = $this->postJson('/email/verification-notification', ['email' => 'missing@example.test']);

        $known->assertAccepted()->assertExactJson([
            'message' => 'If the address is eligible, a verification link will be sent.',
            'code' => 'VERIFICATION_LINK_SENT',
        ]);
        $unknown->assertAccepted()->assertExactJson([
            'message' => 'If the address is eligible, a verification link will be sent.',
            'code' => 'VERIFICATION_LINK_SENT',
        ]);
        Notification::assertSentTo($user, VerifyEmail::class);

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/email/verification-notification', [
                'email' => 'throttle@example.test',
            ])->assertAccepted();
        }
        $this->postJson('/email/verification-notification', [
            'email' => 'throttle@example.test',
        ])->assertTooManyRequests()->assertJsonPath('code', 'RATE_LIMITED');
    }

    public function test_password_recovery_is_generic_and_reset_is_single_use(): void
    {
        Notification::fake();
        $user = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create([
            'password' => 'An old reviewer passphrase',
        ]);

        $unknown = $this->postJson('/forgot-password', ['email' => 'missing@example.test']);
        $known = $this->postJson('/forgot-password', ['email' => $user->email]);
        $unknown->assertAccepted()->assertExactJson([
            'message' => 'If an account matches, a password recovery link will be sent.',
            'code' => 'PASSWORD_RESET_LINK_SENT',
        ]);
        $known->assertAccepted()->assertExactJson([
            'message' => 'If an account matches, a password recovery link will be sent.',
            'code' => 'PASSWORD_RESET_LINK_SENT',
        ]);

        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use ($user): bool {
            $mail = $notification->toMail($user);
            $this->assertInstanceOf(MailMessage::class, $mail);
            $this->assertStringStartsWith(
                'http://localhost:5173/reset-password?',
                (string) $mail->actionUrl,
            );

            return true;
        });

        $plainToken = Password::broker()->createToken($user);
        $this->postJson('/reset-password', [
            'email' => $user->email,
            'token' => $plainToken,
            'password' => 'A brand new reviewer passphrase',
        ])->assertOk()->assertJsonPath('code', 'PASSWORD_RESET');

        $this->postJson('/reset-password', [
            'email' => $user->email,
            'token' => $plainToken,
            'password' => 'Another reviewer passphrase',
        ])->assertUnprocessable()->assertJsonPath('code', 'INVALID_RESET_TOKEN');
        $this->assertTrue(Hash::check('A brand new reviewer passphrase', $user->fresh()->password));
    }

    public function test_expired_password_reset_is_rejected(): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->create();
        $token = Password::broker()->createToken($user);
        $this->travel(61)->minutes();

        $this->postJson('/reset-password', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'A valid replacement passphrase',
        ])->assertUnprocessable()->assertJsonPath('code', 'INVALID_RESET_TOKEN');
    }

    public function test_password_policy_accepts_long_passphrases_and_rejects_short_or_compromised_values(): void
    {
        config(['caneguard.self_registration_enabled' => true, 'caneguard.pilot_roster_certified' => true]);

        $short = $this->postJson('/register', [
            'name' => 'Short Password',
            'email' => 'short@example.test',
            'password' => 'too-short',
        ]);
        $short->assertUnprocessable()->assertJsonPath('code', 'VALIDATION_ERROR');

        $compromised = $this->postJson('/register', [
            'name' => 'Known Password',
            'email' => 'known@example.test',
            'password' => 'correct horse battery staple',
        ]);
        $compromised->assertUnprocessable()->assertJsonPath('code', 'VALIDATION_ERROR');

        $long = str_repeat('x', 64);
        $this->postJson('/register', [
            'name' => 'Long Password',
            'email' => 'long@example.test',
            'password' => $long,
        ])->assertCreated();

        $this->postJson('/register', [
            'name' => 'Too Long Password',
            'email' => 'too-long@example.test',
            'password' => str_repeat('x', 129),
        ])->assertUnprocessable()->assertJsonPath('code', 'VALIDATION_ERROR');
    }

    public function test_password_reset_revokes_sessions_and_all_tokens(): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $first = $user->createToken('first')->plainTextToken;
        $second = $user->createToken('second')->plainTextToken;
        $token = Password::broker()->createToken($user);

        $this->postJson('/reset-password', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'A reset reviewer passphrase',
        ])->assertOk();

        $this->assertNull(PersonalAccessToken::findToken($first));
        $this->assertNull(PersonalAccessToken::findToken($second));
        $this->assertDatabaseCount('sessions', 0);
        $this->assertDatabaseHas('security_audits', [
            'action' => SecurityAudit::ACTION_PASSWORD_RESET,
            'outcome' => SecurityAudit::OUTCOME_SUCCESS,
            'target_user_id' => $user->getKey(),
        ]);
    }

    public function test_password_reset_revokes_a_persisted_web_session(): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        DB::table('sessions')->insert([
            'id' => 'active-session',
            'user_id' => $user->getKey(),
            'payload' => '{}',
            'last_activity' => now()->getTimestamp(),
        ]);
        $token = Password::broker()->createToken($user);

        $this->postJson('/reset-password', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'A session-revoked passphrase',
        ])->assertOk();

        $this->assertDatabaseMissing('sessions', ['id' => 'active-session']);
    }

    public function test_mobile_tokens_expire_in_thirty_days_and_fresh_login_rotates_one_device(): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create([
            'password' => 'A field reporter passphrase',
        ]);
        $payload = [
            'email' => $user->email,
            'password' => 'A field reporter passphrase',
            'device_name' => 'Primary Android',
            'device_id' => 'primary-device-id',
        ];

        $first = $this->postJson('/api/v1/mobile/auth/login', $payload)->json('token');
        $second = $this->postJson('/api/v1/mobile/auth/login', $payload)->json('token');
        $other = $this->postJson('/api/v1/mobile/auth/login', [
            ...$payload,
            'device_name' => 'Backup Android',
            'device_id' => 'backup-device-id',
        ])->json('token');

        $this->assertNull(PersonalAccessToken::findToken($first));
        $this->assertNotNull(PersonalAccessToken::findToken($second));
        $this->assertNotNull(PersonalAccessToken::findToken($other));
        $accessToken = PersonalAccessToken::findToken($second);
        $this->assertSame('primary-device-id', $accessToken?->device_id);
        $this->assertTrue($accessToken->expires_at->equalTo($accessToken->created_at->copy()->addDays(30)));

        $accessToken->forceFill([
            'created_at' => now()->subDays(8),
            'expires_at' => now()->addDays(22),
        ])->save();
        $this->withToken($second)
            ->getJson('/api/v1/mobile/auth/me')
            ->assertOk()
            ->assertJsonPath('user.uuid', $user->uuid);

        $this->withToken($second)
            ->deleteJson('/api/v1/mobile/auth/logout')
            ->assertNoContent();
        $this->assertNull(PersonalAccessToken::findToken($second));
        $this->assertNotNull(PersonalAccessToken::findToken($other));
    }

    public function test_password_change_requires_step_up_and_revokes_authentication(): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create([
            'password' => 'An old reviewer passphrase',
        ]);
        $token = $user->createToken('password-change')->plainTextToken;
        $this->actingAs($user);

        $this->postJson('/api/v1/auth/password', [
            'current_password' => 'An old reviewer passphrase',
            'password' => 'A new reviewer passphrase',
        ])->assertOk()->assertJsonPath('code', 'PASSWORD_CHANGED');

        $this->assertTrue(Hash::check('A new reviewer passphrase', $user->fresh()->password));
        $this->assertNull(PersonalAccessToken::findToken($token));
        $this->assertGuest();
        $this->assertDatabaseHas('security_audits', [
            'action' => SecurityAudit::ACTION_PASSWORD_CHANGE,
            'outcome' => SecurityAudit::OUTCOME_SUCCESS,
            'target_user_id' => $user->getKey(),
        ]);
    }

    public function test_email_change_requires_step_up_and_restarts_verification(): void
    {
        Notification::fake();
        $user = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create([
            'password' => 'An old reviewer passphrase',
        ]);
        $token = $user->createToken('email-change')->plainTextToken;
        $this->actingAs($user);

        $this->patchJson('/api/v1/auth/email', [
            'current_password' => 'An old reviewer passphrase',
            'email' => 'new-email@example.test',
        ])->assertAccepted()->assertJsonPath('code', 'EMAIL_VERIFICATION_REQUIRED');

        $updated = $user->fresh();
        $this->assertSame('new-email@example.test', $updated->email);
        $this->assertNull($updated->email_verified_at);
        $this->assertNull(PersonalAccessToken::findToken($token));
        Notification::assertSentTo($updated, VerifyEmail::class);
    }

    public function test_new_device_enrollment_requires_step_up_and_preserves_other_devices(): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create([
            'password' => 'A field reporter passphrase',
        ]);
        $first = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $user->email,
            'password' => 'A field reporter passphrase',
            'device_name' => 'First Android',
            'device_id' => 'first-device',
        ])->json('token');

        $this->withToken($first)->postJson('/api/v1/mobile/auth/enroll', [
            'current_password' => 'wrong password',
            'device_name' => 'Second Android',
            'device_id' => 'second-device',
        ])->assertUnprocessable()->assertJsonPath('code', 'STEP_UP_REQUIRED');

        $enrollment = $this->withToken($first)->postJson('/api/v1/mobile/auth/enroll', [
            'current_password' => 'A field reporter passphrase',
            'device_name' => 'Second Android',
            'device_id' => 'second-device',
        ])->assertOk();
        $second = $enrollment->json('token');

        $this->assertNotNull($enrollment->json('expires_at'));
        $this->assertNotNull(PersonalAccessToken::findToken($first));
        $this->assertNotNull(PersonalAccessToken::findToken($second));
        $this->assertDatabaseHas('security_audits', [
            'action' => SecurityAudit::ACTION_MOBILE_DEVICE_ENROLLMENT,
            'outcome' => SecurityAudit::OUTCOME_SUCCESS,
            'target_user_id' => $user->getKey(),
        ]);
    }

    public function test_biometric_disablement_requires_step_up_and_revokes_tokens(): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create([
            'password' => 'A reviewer passphrase',
            'biometric_enabled' => true,
        ]);
        $token = $user->createToken('biometric')->plainTextToken;
        $this->actingAs($user);

        $this->postJson('/api/v1/auth/biometric/disable', [
            'current_password' => 'A reviewer passphrase',
        ])->assertOk()->assertJsonPath('code', 'BIOMETRIC_DISABLED');

        $this->assertFalse($user->fresh()->biometric_enabled);
        $this->assertNull(PersonalAccessToken::findToken($token));
        $this->assertDatabaseHas('security_audits', [
            'action' => SecurityAudit::ACTION_BIOMETRIC_DISABLEMENT,
            'outcome' => SecurityAudit::OUTCOME_SUCCESS,
            'target_user_id' => $user->getKey(),
        ]);
    }

    public function test_only_administrators_can_change_roles(): void
    {
        $fieldReporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create([
            'password' => 'A field reporter passphrase',
        ]);
        $target = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $this->actingAs($fieldReporter);

        $this->patchJson('/api/v1/admin/users/'.$target->uuid.'/role', [
            'current_password' => 'A field reporter passphrase',
            'role' => User::ROLE_ADMIN,
        ])->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');
        $this->assertSame(User::ROLE_REVIEWER, $target->fresh()->role);
    }

    public function test_sensitive_changes_require_step_up_and_role_changes_cannot_self_escalate(): void
    {
        $admin = User::factory()->inDistrict($this->pilotDistrict())->admin()->create([
            'password' => 'An administrator passphrase',
        ]);
        $target = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create([
            'password' => 'A reviewer passphrase',
        ]);
        DistrictGrant::query()->create([
            'user_id' => $admin->id,
            'district_id' => $this->pilotDistrict()->id,
            'ability' => 'staff:manage',
        ]);
        $this->actingAs($admin);

        $this->postJson('/api/v1/auth/password', [
            'current_password' => 'wrong password',
            'password' => 'A changed administrator passphrase',
        ])->assertUnprocessable()->assertJsonPath('code', 'STEP_UP_REQUIRED');

        $this->patchJson('/api/v1/admin/users/'.$target->uuid.'/role', [
            'current_password' => 'An administrator passphrase',
            'role' => User::ROLE_FIELD_REPORTER,
        ])->assertOk()->assertJsonPath('code', 'ROLE_CHANGED');
        $this->assertSame(User::ROLE_FIELD_REPORTER, $target->fresh()->role);

        $this->patchJson('/api/v1/admin/users/'.$admin->uuid.'/role', [
            'current_password' => 'An administrator passphrase',
            'role' => User::ROLE_FIELD_REPORTER,
        ])->assertForbidden()->assertJsonPath('code', 'ROLE_CHANGE_FORBIDDEN');
        $this->assertSame(User::ROLE_ADMIN, $admin->fresh()->role);
    }
}
