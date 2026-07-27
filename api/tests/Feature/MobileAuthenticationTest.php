<?php

namespace Tests\Feature;

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
            ->assertJsonPath('expires_at', null)
            ->assertJsonPath('user.uuid', $reporter->uuid)
            ->assertJsonPath('user.name', $reporter->name)
            ->assertJsonPath('user.email', $reporter->email)
            ->assertJsonPath('user.role', User::ROLE_FIELD_REPORTER);

        $plainTextToken = $response->json('token');
        $accessToken = PersonalAccessToken::findToken($plainTextToken);

        $this->assertNotNull($accessToken);
        $this->assertSame('caneguard-mobile:Test Android', $accessToken->name);
        $this->assertSame(
            ['report:submit', 'report:status'],
            $accessToken->abilities,
        );

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
