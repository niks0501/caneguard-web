<?php

namespace Tests\Feature;

use App\Http\Controllers\Auth\LoginController;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Auth;
use Mockery\MockInterface;
use Tests\TestCase;

class WebAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_reviewer_can_login_restore_session_and_logout(): void
    {
        $reviewer = User::factory()->reviewer()->create([
            'email' => 'reviewer@example.test',
            'password' => 'correct-password',
        ]);

        $this->get('/sanctum/csrf-cookie')
            ->assertNoContent()
            ->assertCookie('XSRF-TOKEN');

        $this->postJson('/login', [
            'email' => $reviewer->email,
            'password' => 'correct-password',
        ])->assertNoContent();

        $this->assertAuthenticatedAs($reviewer);
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'uuid' => $reviewer->uuid,
                    'name' => $reviewer->name,
                    'email' => $reviewer->email,
                    'role' => User::ROLE_REVIEWER,
                ],
            ]);

        $this->postJson('/logout')->assertNoContent();
        $this->assertGuest('web');
        Auth::forgetGuards();
        $this->getJson('/api/v1/me')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');
    }

    public function test_admin_can_login_to_the_web_workspace(): void
    {
        $admin = User::factory()->admin()->create([
            'password' => 'correct-password',
        ]);

        $this->postJson('/login', [
            'email' => $admin->email,
            'password' => 'correct-password',
        ])->assertNoContent();

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.role', User::ROLE_ADMIN);
    }

    public function test_invalid_credentials_are_rejected_without_a_session(): void
    {
        $reviewer = User::factory()->reviewer()->create([
            'password' => 'correct-password',
        ]);

        $this->postJson('/login', [
            'email' => $reviewer->email,
            'password' => 'incorrect-password',
        ])
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => 'The provided credentials are invalid.',
                'code' => 'INVALID_CREDENTIALS',
                'errors' => [
                    'email' => ['The provided credentials are invalid.'],
                ],
            ]);

        $this->assertGuest();
    }

    public function test_field_reporter_is_blocked_and_logged_back_out(): void
    {
        $fieldReporter = User::factory()->fieldReporter()->create([
            'password' => 'correct-password',
        ]);

        $this->postJson('/login', [
            'email' => $fieldReporter->email,
            'password' => 'correct-password',
        ])
            ->assertForbidden()
            ->assertExactJson([
                'message' => 'This account cannot access the web workspace.',
                'code' => 'FORBIDDEN',
            ]);

        $this->assertGuest();
    }

    public function test_login_is_rate_limited(): void
    {
        $credentials = [
            'email' => 'rate-limit@example.test',
            'password' => 'incorrect-password',
        ];

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/login', $credentials)
                ->assertUnprocessable();
        }

        $this->postJson('/login', $credentials)
            ->assertTooManyRequests()
            ->assertExactJson([
                'message' => 'Too many requests.',
                'code' => 'RATE_LIMITED',
            ]);
    }

    public function test_login_csrf_failures_use_the_canonical_error_shape(): void
    {
        $this->mock(
            LoginController::class,
            function (MockInterface $mock): void {
                $mock->shouldReceive('__invoke')
                    ->once()
                    ->andThrow(new TokenMismatchException);
            },
        );

        $this->postJson('/login', [
            'email' => 'csrf@example.test',
            'password' => 'irrelevant-password',
        ])
            ->assertStatus(419)
            ->assertExactJson([
                'message' => 'The CSRF token is invalid or expired.',
                'code' => 'CSRF_TOKEN_MISMATCH',
            ]);
    }
}
