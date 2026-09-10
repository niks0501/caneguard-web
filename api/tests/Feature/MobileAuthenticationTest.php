<?php

namespace Tests\Feature;

use App\Actions\Auth\IssueMobileToken;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class MobileAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_field_reporter_can_login_and_restore_mobile_session(): void
    {
        $reporter = User::factory()->fieldReporter()->create([
            'email' => 'field@example.test',
            'password' => 'correct-password',
        ]);

        $response = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => ' FIELD@example.test ',
            'password' => 'correct-password',
            'device_name' => ' Test Android ',
        ])
            ->assertOk()
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonPath('user.uuid', $reporter->uuid)
            ->assertJsonPath('user.name', $reporter->name)
            ->assertJsonPath('user.email', $reporter->email)
            ->assertJsonPath('user.role', User::ROLE_FIELD_REPORTER);

        $this->assertNull($response->json('expires_at'));
        $plainTextToken = $response->json('token');
        $accessToken = PersonalAccessToken::findToken($plainTextToken);

        $this->assertNotNull($accessToken);
        $this->assertSame('caneguard-mobile:Test Android', $accessToken->name);
        $this->assertSame(
            ['report:submit', 'report:status', 'assignment:read', 'assignment:complete', 'notification:read'],
            $accessToken->abilities,
        );
        $this->assertNull($accessToken->expires_at);

        $this->withToken($plainTextToken)
            ->getJson('/api/v1/mobile/auth/me')
            ->assertOk()
            ->assertExactJson([
                'user' => [
                    'uuid' => $reporter->uuid,
                    'name' => $reporter->name,
                    'email' => $reporter->email,
                    'role' => User::ROLE_FIELD_REPORTER,
                ],
            ]);
    }

    public function test_invalid_credentials_are_rejected_without_a_token(): void
    {
        $reporter = User::factory()->fieldReporter()->create([
            'password' => 'correct-password',
        ]);

        $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $reporter->email,
            'password' => 'incorrect-password',
            'device_name' => 'Test Android',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'INVALID_CREDENTIALS');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_web_roles_cannot_receive_mobile_tokens(): void
    {
        foreach ([
            User::factory()->reviewer()->create([
                'password' => 'correct-password',
            ]),
            User::factory()->admin()->create([
                'password' => 'correct-password',
            ]),
        ] as $user) {
            $this->postJson('/api/v1/mobile/auth/login', [
                'email' => $user->email,
                'password' => 'correct-password',
                'device_name' => 'Test Android',
            ])
                ->assertForbidden()
                ->assertJsonPath('code', 'FORBIDDEN');
        }

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_mobile_session_requires_authentication_and_field_reporter_role(): void
    {
        $this->getJson('/api/v1/mobile/auth/me')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        $reviewer = User::factory()->reviewer()->create();
        $token = $reviewer
            ->createToken('reviewer-mobile-session')
            ->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/mobile/auth/me')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_mobile_login_is_rate_limited(): void
    {
        $payload = [
            'email' => 'mobile-rate-limit@example.test',
            'password' => 'incorrect-password',
            'device_name' => 'Test Android',
        ];

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/v1/mobile/auth/login', $payload)
                ->assertUnprocessable();
        }

        $this->postJson('/api/v1/mobile/auth/login', $payload)
            ->assertTooManyRequests()
            ->assertJsonPath('code', 'RATE_LIMITED');
    }

    public function test_login_replaces_only_the_same_device_token(): void
    {
        $reporter = User::factory()->fieldReporter()->create([
            'password' => 'correct-password',
        ]);
        $payload = [
            'email' => $reporter->email,
            'password' => 'correct-password',
            'device_name' => 'Primary Android',
        ];

        $firstToken = $this->postJson(
            '/api/v1/mobile/auth/login',
            $payload,
        )->json('token');
        $secondToken = $this->postJson(
            '/api/v1/mobile/auth/login',
            $payload,
        )->json('token');
        $otherDeviceToken = $this->postJson(
            '/api/v1/mobile/auth/login',
            [...$payload, 'device_name' => 'Backup Android'],
        )->json('token');

        $this->assertNull(PersonalAccessToken::findToken($firstToken));
        $this->assertNotNull(PersonalAccessToken::findToken($secondToken));
        $this->assertNotNull(PersonalAccessToken::findToken($otherDeviceToken));
        $this->assertDatabaseCount('personal_access_tokens', 2);
    }

    public function test_mobile_devices_can_be_listed_without_token_material_and_revoked_individually(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $current = $reporter->createToken(
            IssueMobileToken::TOKEN_NAME_PREFIX.'Current Android',
            IssueMobileToken::abilities(),
        );
        $current->accessToken->forceFill(['device_id' => 'current-device'])->save();
        $other = $reporter->createToken(
            IssueMobileToken::TOKEN_NAME_PREFIX.'Backup Android',
            IssueMobileToken::abilities(),
        );
        $other->accessToken->forceFill(['device_id' => 'backup-device'])->save();
        $webToken = $reporter->createToken('web-session');
        $differentUser = User::factory()->fieldReporter()->create();
        $differentUserToken = $differentUser->createToken(
            IssueMobileToken::TOKEN_NAME_PREFIX.'Different user',
            IssueMobileToken::abilities(),
        );

        $this->withToken($current->plainTextToken)
            ->getJson('/api/v1/mobile/auth/devices')
            ->assertOk()
            ->assertJsonPath('meta.count', 2)
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment([
                'id' => $current->accessToken->getKey(),
                'device_id' => 'current-device',
                'device_name' => 'Current Android',
                'expires_at' => null,
                'is_current' => true,
            ])
            ->assertJsonFragment([
                'id' => $other->accessToken->getKey(),
                'device_id' => 'backup-device',
                'device_name' => 'Backup Android',
                'expires_at' => null,
                'is_current' => false,
            ])
            ->assertJsonMissing(['token' => $current->plainTextToken])
            ->assertJsonMissing(['token' => $current->accessToken->token]);

        $this->withToken($current->plainTextToken)
            ->deleteJson('/api/v1/mobile/auth/devices/'.$other->accessToken->getKey())
            ->assertNoContent();

        $this->assertNull(PersonalAccessToken::findToken($other->plainTextToken));
        $this->assertNotNull(PersonalAccessToken::findToken($current->plainTextToken));
        $this->assertNotNull(PersonalAccessToken::findToken($webToken->plainTextToken));
        $this->assertNotNull(PersonalAccessToken::findToken($differentUserToken->plainTextToken));
        $this->assertDatabaseHas('security_audits', [
            'action' => SecurityAudit::ACTION_MOBILE_DEVICE_REVOCATION,
            'outcome' => SecurityAudit::OUTCOME_SUCCESS,
            'target_user_id' => $reporter->getKey(),
        ]);

        $this->withToken($current->plainTextToken)
            ->deleteJson('/api/v1/mobile/auth/devices/'.$differentUserToken->accessToken->getKey())
            ->assertNotFound()
            ->assertJsonPath('code', 'NOT_FOUND');
        $this->assertNotNull(PersonalAccessToken::findToken($differentUserToken->plainTextToken));
    }

    public function test_revocation_only_accepts_the_numeric_list_handle_and_not_client_device_ids(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $current = $reporter->createToken(
            IssueMobileToken::TOKEN_NAME_PREFIX.'Current Android',
            IssueMobileToken::abilities(),
        );
        $current->accessToken->forceFill(['device_id' => '999999'])->save();
        $backup = $reporter->createToken(
            IssueMobileToken::TOKEN_NAME_PREFIX.'Backup Android',
            IssueMobileToken::abilities(),
        );
        $backup->accessToken->forceFill(['device_id' => 'backup-device'])->save();

        $this->withToken($current->plainTextToken)
            ->deleteJson('/api/v1/mobile/auth/devices/backup-device')
            ->assertNotFound()
            ->assertJsonPath('code', 'NOT_FOUND');
        $this->withToken($current->plainTextToken)
            ->deleteJson('/api/v1/mobile/auth/devices/999999')
            ->assertNotFound()
            ->assertJsonPath('code', 'NOT_FOUND');

        $this->assertNotNull(PersonalAccessToken::findToken($current->plainTextToken));
        $this->assertNotNull(PersonalAccessToken::findToken($backup->plainTextToken));
        $this->assertDatabaseMissing('security_audits', [
            'action' => SecurityAudit::ACTION_MOBILE_DEVICE_REVOCATION,
        ]);

        $this->withToken($current->plainTextToken)
            ->deleteJson('/api/v1/mobile/auth/devices/'.$backup->accessToken->getKey())
            ->assertNoContent();

        $this->assertNull(PersonalAccessToken::findToken($backup->plainTextToken));
        $this->assertNotNull(PersonalAccessToken::findToken($current->plainTextToken));
    }

    public function test_logout_revokes_only_the_current_access_token(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $current = $reporter->createToken(
            'current',
            ['report:submit', 'report:status'],
        );
        $other = $reporter->createToken(
            'other',
            ['report:submit', 'report:status'],
        );

        $this->withToken($current->plainTextToken)
            ->deleteJson('/api/v1/mobile/auth/logout')
            ->assertNoContent();

        $this->assertNull(
            PersonalAccessToken::findToken($current->plainTextToken),
        );
        $this->assertNotNull(
            PersonalAccessToken::findToken($other->plainTextToken),
        );
    }
}
