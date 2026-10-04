<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\StaffInvitation;
use App\Models\User;
use App\Notifications\StaffInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class StaffProvisioningTest extends TestCase
{
    use RefreshDatabase;

    private function approver(): User
    {
        $actor = User::factory()->admin()->create(['password' => 'Approved provisioner passphrase']);
        config(['caneguard.access.approver_identity' => $actor->uuid]);

        return $actor;
    }

    private function invite(User $actor, User $target, string $role = User::ROLE_FIELD_REPORTER): string
    {
        Notification::fake();
        $this->actingAs($actor)->postJson('/api/v1/staff/invitations', [
            'user_uuid' => $target->uuid,
            'role' => $role,
            'authority_reference' => 'OFFICE_APPROVED_ROSTER_TEST_001',
            'current_password' => 'Approved provisioner passphrase',
        ])->assertCreated()->assertJsonMissingPath('token');
        $token = '';
        Notification::assertSentTo($target, StaffInvitationNotification::class, function ($notice) use ($target, &$token): bool {
            $url = $notice->toMail($target)->actionUrl;
            $this->assertStringStartsWith('http://localhost:5173/accept-staff-invitation#', $url);
            $token = parse_url($url, PHP_URL_FRAGMENT);

            return strlen($token) === 64;
        });
        $this->app['auth']->forgetGuards();

        return $token;
    }

    private function accept(string $token, User $target, string $password = 'Pending staff account passphrase')
    {
        return $this->postJson('/staff/invitations/accept', [
            'token' => $token,
            'email' => $target->email,
            'current_password' => $password,
            'role' => User::ROLE_ADMIN,
            'staff_certified_at' => now()->toISOString(),
        ]);
    }

    public function test_signup_and_email_verification_never_grant_inspector_authority(): void
    {
        Notification::fake();
        config(['caneguard.self_registration_enabled' => true]);
        $this->postJson('/register', [
            'name' => 'Pending Staff', 'email' => 'pending@example.test',
            'password' => 'Pending staff account passphrase',
            'role' => User::ROLE_ADMIN, 'abilities' => ['*'],
            'staff_certified_at' => now()->toISOString(),
            'staff_authority_reference' => 'FORGED', 'district_id' => 'FORGED',
        ])->assertCreated()->assertJsonPath('user.role', User::ROLE_FARMER);
        $user = User::query()->where('email', 'pending@example.test')->sole();
        $url = URL::temporarySignedRoute('verification.verify', now()->addHour(), [
            'id' => $user->id, 'hash' => sha1($user->email),
        ]);
        $this->getJson($url)->assertOk();
        $this->assertFalse($user->fresh()->isCertifiedStaff());
        $this->postJson('/login', ['email' => $user->email, 'password' => 'Pending staff account passphrase'])->assertForbidden();
        $login = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $user->email, 'password' => 'Pending staff account passphrase',
            'device_name' => 'Farmer test', 'device_id' => 'farmer-test-device',
        ])->assertOk();
        $token = $login->json('token');
        $this->assertSame([], PersonalAccessToken::findToken($token)->abilities);
        $this->withToken($token)->getJson('/api/v1/mobile/auth/me')->assertOk()->assertJsonPath('user.role', User::ROLE_FARMER);
        $this->withToken($token)->postJson('/api/v1/mobile/reports', [])->assertForbidden();
        $this->assertDatabaseCount('reports', 0);
    }

    public function test_uncertified_and_farmer_sessions_and_wildcard_tokens_cannot_access_restricted_records(): void
    {
        $report = Report::factory()->create();
        $reads = [
            '/api/v1/reports', "/api/v1/reports/{$report->uuid}",
            "/api/v1/reports/{$report->uuid}/image", "/api/v1/reports/{$report->uuid}/validation-photo",
            "/api/v1/reports/{$report->uuid}/referral-summary", '/api/v1/reports/export',
            '/api/v1/reports/summary', '/api/v1/reports/map', '/api/v1/reports/analytics',
            '/api/v1/dashboard/summary', '/api/v1/reports/documents/report',
            '/api/v1/mobile/reports/statuses', '/api/v2/mobile/reports/statuses', '/api/v3/mobile/reports/statuses',
            '/api/v1/mobile/assignments', '/api/v1/mobile/notifications',
        ];
        foreach ([User::ROLE_FARMER, User::ROLE_FIELD_REPORTER, User::ROLE_REVIEWER, User::ROLE_ADMIN, 'disabled', 'unclassified'] as $role) {
            $user = User::factory()->uncertified()->create(['role' => $role]);
            foreach (['cookie', 'token'] as $mode) {
                $this->app['auth']->forgetGuards();
                if ($mode === 'cookie') {
                    $this->actingAs($user);
                } else {
                    $this->withToken($user->createToken('forged-wildcard', ['*'])->plainTextToken);
                }
                foreach ($reads as $url) {
                    $this->getJson($url)->assertForbidden();
                }
                $this->postJson('/api/v1/mobile/reports', [])->assertForbidden();
                $this->postJson('/api/v2/mobile/reports', [])->assertForbidden();
                $this->patchJson("/api/v1/reports/{$report->uuid}/review", [])->assertForbidden();
                $this->postJson("/api/v1/reports/{$report->uuid}/handoff-notes", [])->assertForbidden();
            }
        }
        $this->assertDatabaseCount('reports', 1);
        $this->assertDatabaseCount('report_review_events', 0);
        $this->assertDatabaseCount('report_handoff_notes', 0);
    }

    public function test_uncertified_staff_cannot_sign_in_to_staff_clients_or_receive_inspector_tokens(): void
    {
        foreach ([User::ROLE_FIELD_REPORTER, User::ROLE_REVIEWER, User::ROLE_ADMIN] as $role) {
            $user = User::factory()->uncertified()->create(['role' => $role, 'password' => 'Pending staff account passphrase']);
            $credentials = ['email' => $user->email, 'password' => 'Pending staff account passphrase'];
            $this->postJson('/login', $credentials)->assertForbidden();
            $this->postJson('/api/v1/mobile/auth/login', [...$credentials, 'device_name' => 'Pending staff'])->assertForbidden();
        }
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_roster_approved_invitation_certifies_exact_role_and_revokes_previous_authentication(): void
    {
        $actor = $this->approver();
        $target = User::factory()->farmer()->create(['password' => 'Pending staff account passphrase']);
        $report = Report::factory()->create(['reporter_id' => $target->id]);
        $oldToken = $target->createToken('before-certification')->plainTextToken;
        DB::table('sessions')->insert(['id' => 'old-session', 'user_id' => $target->id, 'payload' => '{}', 'last_activity' => now()->timestamp]);
        $token = $this->invite($actor, $target);
        $this->assertFalse($target->fresh()->isCertifiedStaff());
        $this->assertNotSame($token, StaffInvitation::query()->sole()->token_hash);
        $this->accept($token, $target)->assertOk()->assertJsonPath('code', 'STAFF_CERTIFIED');
        $this->assertTrue($target->fresh()->isFieldReporter());
        $this->assertSame(User::ROLE_FIELD_REPORTER, $target->fresh()->role);
        $this->assertSame($actor->id, $target->fresh()->staff_certified_by);
        $this->assertNull(PersonalAccessToken::findToken($oldToken));
        $this->assertDatabaseMissing('sessions', ['id' => 'old-session']);
        $this->assertSame($target->id, $report->fresh()->reporter_id);
        $this->assertDatabaseHas('security_audits', ['action' => 'staff_certification', 'actor_id' => $actor->id, 'target_user_id' => $target->id, 'outcome' => 'success']);
        $this->accept($token, $target)->assertForbidden();
        $login = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $target->email, 'password' => 'Pending staff account passphrase', 'device_name' => 'Approved inspector',
        ])->assertOk();
        $this->withToken($login->json('token'))->getJson('/api/v1/mobile/reports/statuses')->assertOk();
        $this->assertContains('report:submit', PersonalAccessToken::findToken($login->json('token'))->abilities);
    }

    public function test_invitation_requires_correct_recipient_password_and_current_delegation(): void
    {
        $actor = $this->approver();
        $target = User::factory()->farmer()->create(['password' => 'Pending staff account passphrase']);
        $token = $this->invite($actor, $target);
        $this->accept($token, $target, 'incorrect')->assertForbidden();
        $other = User::factory()->farmer()->create(['password' => 'Pending staff account passphrase']);
        $this->accept($token, $other)->assertForbidden();
        $this->assertFalse($target->fresh()->isCertifiedStaff());
        config(['caneguard.access.approver_identity' => 'APPROVER_TBD']);
        $this->accept($token, $target)->assertForbidden();
        $this->assertNull(StaffInvitation::query()->sole()->accepted_at);
    }

    public function test_expired_revoked_and_changed_email_invitations_are_denied(): void
    {
        $actor = $this->approver();
        $target = User::factory()->farmer()->create(['password' => 'Pending staff account passphrase']);
        $old = $this->invite($actor, $target);
        $token = $this->invite($actor, $target);
        $this->accept($old, $target)->assertForbidden();
        $target->forceFill(['email' => 'changed@example.test'])->save();
        $this->accept($token, $target)->assertForbidden();
        $target->forceFill(['email' => 'original@example.test'])->save();
        $newToken = $this->invite($actor, $target);
        $this->travel(49)->hours();
        $this->accept($newToken, $target)->assertForbidden();
        $this->assertFalse($target->fresh()->isCertifiedStaff());
    }

    public function test_admin_alone_cannot_invite_or_promote_and_provisioner_cannot_self_promote(): void
    {
        $admin = User::factory()->admin()->create(['password' => 'Approved provisioner passphrase']);
        $target = User::factory()->farmer()->create();
        $payload = ['user_uuid' => $target->uuid, 'role' => User::ROLE_ADMIN, 'authority_reference' => 'ROSTER', 'current_password' => 'Approved provisioner passphrase'];
        $this->actingAs($admin)->postJson('/api/v1/staff/invitations', $payload)->assertForbidden();
        $this->patchJson("/api/v1/admin/users/{$target->uuid}/role", $payload)->assertForbidden();
        config(['caneguard.access.approver_identity' => $admin->uuid]);
        $this->postJson('/api/v1/staff/invitations', [...$payload, 'user_uuid' => $admin->uuid])->assertForbidden();
        $this->patchJson("/api/v1/admin/users/{$target->uuid}/role", $payload)->assertUnprocessable();
        $this->postJson('/api/v1/staff/invitations', [...$payload, 'current_password' => 'wrong'])->assertUnprocessable();
        $this->assertDatabaseCount('staff_invitations', 0);
    }

    public function test_trusted_roster_command_bootstraps_only_configured_verified_identity_and_preserves_history(): void
    {
        $actor = User::factory()->admin()->uncertified()->create();
        $this->artisan('staff:certify-roster', ['user_uuid' => $actor->uuid, 'role' => User::ROLE_ADMIN, 'authority_reference' => 'APPROVED_BOOTSTRAP_ROSTER'])->assertFailed();
        config(['caneguard.access.approver_identity' => $actor->uuid]);
        $this->artisan('staff:certify-roster', ['user_uuid' => $actor->uuid, 'role' => User::ROLE_ADMIN, 'authority_reference' => 'APPROVED_BOOTSTRAP_ROSTER'])->assertSuccessful();
        $this->assertTrue($actor->fresh()->canManageStaff());
        $target = User::factory()->fieldReporter()->uncertified()->create();
        $report = Report::factory()->create(['reporter_id' => $target->id]);
        $this->artisan('staff:certify-roster', ['user_uuid' => $target->uuid, 'role' => User::ROLE_FIELD_REPORTER, 'authority_reference' => 'APPROVED_LEGACY_ROSTER'])->assertSuccessful();
        $this->assertTrue($target->fresh()->isFieldReporter());
        $this->assertSame($target->id, $report->fresh()->reporter_id);
        $unknown = User::factory()->create(['role' => 'disabled']);
        $this->artisan('staff:certify-roster', ['user_uuid' => $unknown->uuid, 'role' => User::ROLE_REVIEWER, 'authority_reference' => 'APPROVED_ROSTER'])->assertFailed();
    }

    public function test_public_configuration_marks_placeholders_without_claiming_district_enforcement(): void
    {
        config(['caneguard.access.approver_identity' => 'APPROVER_TBD', 'caneguard.access.pilot_district' => 'DISTRICT_TBD']);
        $this->getJson('/api/v1/access-configuration')->assertOk()->assertJsonPath('data.staff_approver.label', 'To be assigned')->assertJsonPath('data.pilot_district.placeholder', true)->assertJsonPath('data.district_enforcement', false);
        config(['caneguard.access.approver_identity' => 'configured-identity', 'caneguard.access.pilot_district' => 'Office-confirmed pilot']);
        $this->getJson('/api/v1/access-configuration')->assertOk()->assertJsonPath('data.staff_approver.label', 'Assigned')->assertJsonPath('data.pilot_district.label', 'Office-confirmed pilot')->assertJsonMissingPath('data.approver_identity');
    }

    public function test_cross_origin_acceptance_is_covered_by_the_csrf_cookie_cors_contract(): void
    {
        config(['cors.allowed_origins' => ['http://localhost:5173']]);
        $this->withHeaders([
            'Origin' => 'http://localhost:5173',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'content-type,x-xsrf-token',
        ])->options('/staff/invitations/accept')->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
            ->assertHeader('Access-Control-Allow-Credentials', 'true');
    }

    public function test_demoting_staff_revokes_pending_invitations_and_cannot_be_reversed_with_an_old_link(): void
    {
        $actor = $this->approver();
        $target = User::factory()->reviewer()->create(['password' => 'Pending staff account passphrase']);
        $token = $this->invite($actor, $target);
        $this->actingAs($actor)->patchJson("/api/v1/admin/users/{$target->uuid}/role", [
            'role' => User::ROLE_FARMER,
            'current_password' => 'Approved provisioner passphrase',
        ])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->accept($token, $target)->assertForbidden();
        $this->assertFalse($target->fresh()->isCertifiedStaff());
        $this->assertNotNull(StaffInvitation::query()->sole()->revoked_at);
    }

    public function test_signed_retired_consult_links_never_reopen_anonymous_json_or_photos(): void
    {
        foreach (['/api/v1/consult-invites/old-token', '/api/v1/consult-invites/old-token/image'] as $path) {
            $this->getJson(URL::temporarySignedRoute('api.v1.reports.image', now()->addHour(), ['report' => Report::factory()->create()->uuid]))->assertUnauthorized();
            $this->getJson($path.'?expires=9999999999&signature=legacy')->assertNotFound();
        }
    }
}
