<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AuthSignInSurfaceTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string, string, string}> */
    public static function roles(): array
    {
        return [
            'farmer' => ['farmer', 'mobile', 'tl'],
            'inspector' => ['fieldReporter', 'mobile', 'en'],
            'reviewer' => ['reviewer', 'web', 'en'],
        ];
    }

    #[DataProvider('roles')]
    public function test_a_redeemed_reset_link_names_the_app_the_account_signs_in_to(string $factoryState, string $surface, string $locale): void
    {
        $user = User::factory()->unverified()->{$factoryState}()->create();
        $token = Password::broker()->getRepository()->create($user);
        DB::table('password_reset_tokens')->where('email', $user->email)->update(['user_id' => $user->getKey()]);

        $this->postJson('/reset-password', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'tubo sa bukid 2026 ay masarap',
            'password_confirmation' => 'tubo sa bukid 2026 ay masarap',
        ])->assertOk()
            ->assertJsonPath('code', 'PASSWORD_RESET')
            ->assertJsonPath('sign_in_surface', $surface)
            ->assertJsonPath('locale_hint', $locale);
    }

    #[DataProvider('roles')]
    public function test_a_valid_verification_link_names_the_app_the_account_signs_in_to(string $factoryState, string $surface, string $locale): void
    {
        $user = User::factory()->unverified()->{$factoryState}()->create();
        $url = URL::temporarySignedRoute(
            'verification.verify',
            now()->addHour(),
            ['id' => $user->getKey(), 'hash' => sha1($user->email)],
        );
        $link = parse_url($url, PHP_URL_PATH).'?'.parse_url($url, PHP_URL_QUERY);

        $this->getJson($link)->assertOk()
            ->assertJsonPath('sign_in_surface', $surface)
            ->assertJsonPath('locale_hint', $locale);
        // A replayed link is still proven by its signature.
        $this->getJson($link)->assertOk()->assertJsonPath('sign_in_surface', $surface);
    }

    public function test_failed_redemptions_reveal_nothing_about_the_account(): void
    {
        Notification::fake();
        $farmer = User::factory()->farmer()->create();
        $unknown = $this->postJson('/reset-password', [
            'email' => 'nobody@example.test',
            'token' => 'wrong',
            'password' => 'tubo sa bukid 2026 ay masarap',
            'password_confirmation' => 'tubo sa bukid 2026 ay masarap',
        ]);
        $badToken = $this->postJson('/reset-password', [
            'email' => $farmer->email,
            'token' => 'wrong',
            'password' => 'tubo sa bukid 2026 ay masarap',
            'password_confirmation' => 'tubo sa bukid 2026 ay masarap',
        ]);
        $badSignature = $this->getJson('/email/verify/'.$farmer->getKey().'/'.sha1($farmer->email).'?expires=9999999999&signature=invalid');

        foreach ([$unknown, $badToken, $badSignature] as $response) {
            $response->assertJsonMissingPath('sign_in_surface')->assertJsonMissingPath('locale_hint');
        }
        $this->assertSame($unknown->json(), $badToken->json());
        Notification::assertNothingSent();
    }
}
