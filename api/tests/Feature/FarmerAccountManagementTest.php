<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class FarmerAccountManagementTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'password';

    protected function setUp(): void
    {
        parent::setUp();
        config(['caneguard.auth.password_reset_url' => 'https://app.example.test/reset-password']);
    }

    private function admin(): User
    {
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web');

        return $admin;
    }

    private function payload(array $override = []): array
    {
        return array_merge(['name' => 'John Ley Vasquez', 'email' => 'john@example.test', 'role' => 'farmer', 'current_password' => self::PASSWORD], $override);
    }

    public function test_creating_a_farmer_stores_an_optional_home_barangay_and_sends_an_invite(): void
    {
        Notification::fake();
        $this->admin();

        $this->postJson('/api/v1/admin/accounts', $this->payload(['barangay' => 'Aga']))
            ->assertCreated()
            ->assertJsonPath('data.role', 'farmer')
            ->assertJsonPath('data.barangay', 'Aga')
            ->assertJsonPath('invite_sent', true);

        $farmer = User::query()->where('email', 'john@example.test')->firstOrFail();
        $this->assertSame('Aga', $farmer->barangay);
        $this->assertNull($farmer->email_verified_at);
        Notification::assertSentTo($farmer, ResetPassword::class);

        $this->postJson('/api/v1/admin/accounts', $this->payload(['email' => 'two@example.test']))
            ->assertCreated()->assertJsonPath('data.barangay', null);
    }

    public function test_a_home_barangay_must_be_a_known_barangay_and_only_applies_to_farmers(): void
    {
        Notification::fake();
        $this->admin();

        $this->postJson('/api/v1/admin/accounts', $this->payload(['barangay' => 'Atlantis']))->assertUnprocessable();
        $this->postJson('/api/v1/admin/accounts', $this->payload(['role' => 'reviewer', 'barangay' => 'Aga']))->assertUnprocessable();
    }

    public function test_the_farmer_directory_lists_only_farmers_and_filters_by_barangay_and_status(): void
    {
        $this->admin();
        User::factory()->farmer()->create(['name' => 'Marites', 'barangay' => 'Lumbangan']);
        User::factory()->farmer()->unverified()->create(['name' => 'John Ley', 'barangay' => 'Aga']);
        User::factory()->farmer()->create(['name' => 'Roberto', 'barangay' => 'Tumalim', 'is_active' => false]);
        User::factory()->reviewer()->create(['name' => 'Office Reviewer']);

        $all = $this->getJson('/api/v1/admin/accounts/farmers')->assertOk();
        $this->assertSame(['John Ley', 'Marites', 'Roberto'], collect($all->json('data'))->pluck('name')->all());
        $this->assertSame(
            ['invite_pending', 'active', 'disabled'],
            collect($all->json('data'))->pluck('status')->all(),
        );
        $this->assertSame(['Marites'], collect($this->getJson('/api/v1/admin/accounts/farmers?barangay=Lumbangan')->json('data'))->pluck('name')->all());
        $this->assertSame(['Roberto'], collect($this->getJson('/api/v1/admin/accounts/farmers?status=disabled')->json('data'))->pluck('name')->all());
        $this->assertSame(['John Ley'], collect($this->getJson('/api/v1/admin/accounts/farmers?status=invite_pending')->json('data'))->pluck('name')->all());
        $this->assertSame(['Marites'], collect($this->getJson('/api/v1/admin/accounts/farmers?status=active')->json('data'))->pluck('name')->all());
        $this->assertSame(['Roberto'], collect($this->getJson('/api/v1/admin/accounts/farmers?search=rober')->json('data'))->pluck('name')->all());
        $this->getJson('/api/v1/admin/accounts/farmers?barangay=Atlantis')->assertUnprocessable();
    }

    public function test_the_farmer_directory_and_edits_are_for_active_administrators_only(): void
    {
        $farmer = User::factory()->farmer()->create();
        foreach ([User::factory()->reviewer()->create(), User::factory()->fieldReporter()->create(), $farmer] as $user) {
            $this->actingAs($user, 'web');
            $this->getJson('/api/v1/admin/accounts/farmers')->assertForbidden();
            $this->patchJson('/api/v1/admin/accounts/farmers/'.$farmer->uuid, [
                'is_active' => false, 'current_password' => self::PASSWORD, 'expected_access_version' => $farmer->access_version,
            ])->assertForbidden();
        }
        $this->assertTrue($farmer->fresh()->is_active);
    }

    public function test_an_unverified_farmer_can_be_sent_the_set_password_link_again(): void
    {
        Notification::fake();
        $this->admin();
        $farmer = User::factory()->farmer()->unverified()->create();

        $this->postJson('/api/v1/admin/accounts/'.$farmer->uuid.'/invite')
            ->assertOk()->assertJsonPath('invite_sent', true);
        Notification::assertSentTo($farmer, ResetPassword::class);

        $active = User::factory()->farmer()->create();
        $this->postJson('/api/v1/admin/accounts/'.$active->uuid.'/invite')->assertStatus(409);
    }

    public function test_disabling_a_farmer_revokes_their_tokens_and_every_later_request_is_refused_until_re_enabled(): void
    {
        $admin = User::factory()->admin()->create();
        $farmer = User::factory()->farmer()->create(['password' => 'A farmer passphrase for tests']);
        // Farmer calls run with no office session, so the bearer token is the only identity.
        $asFarmer = function (callable $request) {
            $this->app['auth']->forgetGuards();
            $response = $request();
            $this->flushHeaders();
            $this->app['auth']->forgetGuards();

            return $response;
        };
        $login = fn (): string => (string) $asFarmer(fn () => $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $farmer->email, 'password' => 'A farmer passphrase for tests', 'device_name' => 'Phone', 'device_id' => 'phone-1',
        ]))->assertOk()->json('token');
        $me = fn (string $token) => $asFarmer(fn () => $this->withToken($token)->getJson('/api/v1/mobile/auth/me'));
        $setActive = fn (bool $active) => $this->actingAs($admin, 'web')->patchJson('/api/v1/admin/accounts/farmers/'.$farmer->uuid, [
            'is_active' => $active, 'current_password' => self::PASSWORD, 'expected_access_version' => $farmer->fresh()->access_version,
        ]);

        $before = $login();
        $me($before)->assertOk()->assertJsonPath('user.role', 'farmer');

        $setActive(false)->assertOk()->assertJsonPath('data.status', 'disabled');
        $this->assertFalse($farmer->fresh()->is_active);
        $this->assertSame(0, $farmer->tokens()->count());
        $me($before)->assertUnauthorized();
        // Sign-in still issues a token, but it is refused on every use.
        $me($login())->assertUnauthorized()->assertJsonPath('code', 'ACCOUNT_DISABLED');
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $farmer->id, 'action' => 'account_status_change', 'outcome' => 'success']);

        $this->app['auth']->forgetGuards();
        $setActive(true)->assertOk()->assertJsonPath('data.status', 'active');
        $me($login())->assertOk();
    }

    public function test_farmer_edits_need_the_admins_password_a_current_version_and_a_known_barangay(): void
    {
        $this->admin();
        $farmer = User::factory()->farmer()->create(['barangay' => 'Aga']);
        $url = '/api/v1/admin/accounts/farmers/'.$farmer->uuid;
        $version = $farmer->access_version;

        $this->patchJson($url, ['is_active' => false, 'current_password' => 'wrong', 'expected_access_version' => $version])->assertUnprocessable();
        $this->patchJson($url, ['is_active' => false, 'current_password' => self::PASSWORD, 'expected_access_version' => $version + 5])->assertStatus(409);
        $this->patchJson($url, ['barangay' => 'Atlantis', 'current_password' => self::PASSWORD, 'expected_access_version' => $version])->assertUnprocessable();
        $this->patchJson($url, ['current_password' => self::PASSWORD, 'expected_access_version' => $version])->assertUnprocessable();
        $this->patchJson($url, ['role' => 'admin', 'is_active' => true, 'current_password' => self::PASSWORD, 'expected_access_version' => $version])->assertUnprocessable();
        $this->assertTrue($farmer->fresh()->is_active);

        $this->patchJson($url, ['barangay' => 'Banilad', 'current_password' => self::PASSWORD, 'expected_access_version' => $version])
            ->assertOk()->assertJsonPath('data.barangay', 'Banilad');
        // A no-op write leaves the version alone.
        $same = $farmer->fresh()->access_version;
        $this->patchJson($url, ['barangay' => 'Banilad', 'current_password' => self::PASSWORD, 'expected_access_version' => $same])->assertOk();
        $this->assertSame($same, $farmer->fresh()->access_version);
    }

    public function test_the_farmer_endpoint_never_touches_inspectors_or_office_accounts(): void
    {
        $this->admin();
        foreach ([User::factory()->fieldReporter()->create(), User::factory()->reviewer()->create()] as $other) {
            $this->patchJson('/api/v1/admin/accounts/farmers/'.$other->uuid, [
                'is_active' => false, 'current_password' => self::PASSWORD, 'expected_access_version' => $other->access_version,
            ])->assertNotFound();
            $this->assertTrue($other->fresh()->is_active);
        }
    }

    public function test_a_farmers_detail_and_history_are_readable_by_an_administrator(): void
    {
        $this->admin();
        $farmer = User::factory()->farmer()->create(['barangay' => 'Aga']);

        $this->getJson('/api/v1/admin/accounts/'.$farmer->uuid)->assertOk()->assertJsonPath('data.barangay', 'Aga');
        $this->getJson('/api/v1/admin/accounts/'.$farmer->uuid.'/events')->assertOk();
    }
}
