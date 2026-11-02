<?php

namespace Tests\Feature;

use App\Models\AccountAccessEvent;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AdminAccountCreationTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $override = []): array
    {
        return array_merge(['name' => 'New Person', 'email' => 'New.Person@example.test', 'role' => 'reviewer', 'current_password' => 'password'], $override);
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

    public function test_role_allow_list_rejects_farmer_and_unknown_roles_and_extra_fields(): void
    {
        Notification::fake();
        $this->pilotDistrict();
        $this->actingAs(User::factory()->admin()->create(), 'web');

        foreach (['farmer', 'disabled', 'superuser', ''] as $role) {
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

        $this->postJson('/reset-password', ['email' => 'invitee@example.test', 'token' => $token,
            'password' => 'Str0ng-Passphrase!42', 'password_confirmation' => 'Str0ng-Passphrase!42'])->assertOk();

        $user->refresh();
        $this->assertNotNull($user->email_verified_at);
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $user->id, 'action' => 'email_verification', 'outcome' => 'success']);
    }
}
