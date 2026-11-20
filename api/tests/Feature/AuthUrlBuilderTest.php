<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AuthUrlBuilderTest extends TestCase
{
    use RefreshDatabase;

    public function test_configured_query_does_not_shadow_the_issued_credentials(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://web.example.test/reset-password?token=stale&lang=en']);
        $user = User::factory()->make(['email' => 'owner@example.test']);

        $link = app(\App\Support\AuthUrlBuilder::class)->passwordReset($user, 'issued-token');

        $query = (string) parse_url($link, PHP_URL_QUERY);
        parse_str($query, $parsed);
        $this->assertSame('issued-token', $parsed['token']);
        $this->assertSame('owner@example.test', $parsed['email']);
        $this->assertSame('en', $parsed['lang']);
        $this->assertSame(1, substr_count($query, 'token='));
    }

    public function test_configured_auth_url_with_a_fragment_is_rejected(): void
    {
        config(['caneguard.auth.password_reset_url' => 'https://web.example.test/reset-password#help']);
        $user = User::factory()->make(['email' => 'owner@example.test']);

        $this->expectException(\LogicException::class);

        app(\App\Support\AuthUrlBuilder::class)->passwordReset($user, 'reset-token-for-test');
    }

    public function test_auth_notifications_use_configured_urls(): void
    {
        config([
            'caneguard.auth.verification_url' => 'https://web.example.test/verify-email',
            'caneguard.auth.password_reset_url' => 'https://web.example.test/reset-password',
        ]);
        Notification::fake();
        $user = User::factory()->unverified()->create();

        $user->sendEmailVerificationNotification();
        $user->sendPasswordResetNotification('reset-token-for-test');

        Notification::assertSentTo($user, VerifyEmail::class, function (VerifyEmail $notification) use ($user): bool {
            $mail = $notification->toMail($user);
            $query = [];
            parse_str((string) parse_url((string) $mail->actionUrl, PHP_URL_QUERY), $query);

            return $mail instanceof MailMessage
                && str_starts_with((string) $mail->actionUrl, 'https://web.example.test/verify-email?')
                && isset($query['id'], $query['hash'], $query['expires'], $query['signature'])
                && $query['id'] === (string) $user->getKey()
                && $query['hash'] === sha1($user->email);
        });
        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use ($user): bool {
            $mail = $notification->toMail($user);

            return $mail instanceof MailMessage
                && str_starts_with((string) $mail->actionUrl, 'https://web.example.test/reset-password?');
        });
    }
}
