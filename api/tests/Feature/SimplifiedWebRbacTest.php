<?php

namespace Tests\Feature;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Models\DistrictRecipientSet;
use App\Models\DistrictReportTransmission;
use App\Models\DistrictReportVersion;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class SimplifiedWebRbacTest extends TestCase
{
    use RefreshDatabase;

    public function test_authentication_active_and_role_gates_apply_to_direct_api_calls(): void
    {
        $target = User::factory()->reviewer()->create();
        $paths = ['/api/v1/me', '/api/v1/reports', '/api/v1/admin/accounts', '/api/v1/district-reporting-settings'];
        foreach ($paths as $path) {
            $this->getJson($path)->assertUnauthorized();
        }
        foreach (['reviewer', 'admin'] as $role) {
            $actor = User::factory()->create(['role' => $role, 'is_active' => false]);
            Auth::forgetGuards();
            $this->actingAs($actor, 'web');
            foreach ($paths as $path) {
                $this->getJson($path)->assertUnauthorized()->assertJsonPath('code', 'ACCOUNT_DISABLED');
                $this->actingAs($actor, 'web');
            }
            $this->patchJson('/api/v1/admin/accounts/'.$target->uuid, $this->body($target))->assertUnauthorized();
        }
        $reviewer = User::factory()->reviewer()->create();
        Auth::forgetGuards();
        $this->actingAs($reviewer, 'web');
        $this->getJson('/api/v1/admin/accounts')->assertForbidden();
        $this->getJson('/api/v1/admin/accounts/'.$target->uuid.'/events')->assertForbidden();
        $this->patchJson('/api/v1/admin/accounts/'.$target->uuid, $this->body($target))->assertForbidden();
        $this->getJson('/api/v1/district-reporting-settings')->assertForbidden();
        $this->putJson('/api/v1/district-reporting-settings', [])->assertForbidden();
        $this->assertDatabaseCount('security_audits', 0);
    }

    public function test_web_roles_need_neither_membership_nor_named_grants_and_policy_permits_report_review(): void
    {
        $report = Report::factory()->create();
        foreach (['reviewer', 'admin'] as $role) {
            $user = User::factory()->create(['role' => $role]);
            Auth::forgetGuards();
            $this->actingAs($user, 'web');
            $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.is_active', true)->assertJsonMissingPath('data.capabilities');
            $this->getJson('/api/v1/reports')->assertOk()->assertJsonPath('meta.total', 1);
            $this->getJson('/api/v1/reports/'.$report->uuid)->assertOk();
            $this->assertTrue($user->can('review', $report));
        }
        $this->getJson('/api/v1/admin/accounts')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonMissingPath('data.0.grants')->assertJsonMissingPath('data.0.district_id');
        $this->assertDatabaseCount('district_memberships', 0);
        $this->assertDatabaseCount('district_grants', 0);
    }

    public function test_admin_role_and_status_changes_require_step_up_and_write_per_user_history(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->reviewer()->create();
        $this->actingAs($admin, 'web');
        $path = '/api/v1/admin/accounts/'.$target->uuid;
        $this->patchJson($path, [...$this->body($target), 'current_password' => 'wrong'])->assertUnprocessable();
        $this->assertSame('reviewer', $target->fresh()->role);
        $this->patchJson($path, [...$this->body($target), 'role' => 'field_reporter'])->assertUnprocessable();
        $this->patchJson($path, [...$this->body($target), 'grants' => ['staff:manage']])->assertUnprocessable();
        $this->patchJson($path, [...$this->body($target), 'role' => 'admin', 'is_active' => false])
            ->assertOk()->assertJsonPath('data.role', 'admin')->assertJsonPath('data.is_active', false);
        $this->getJson($path.'/events')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.action', 'account_status_change')
            ->assertJsonPath('data.0.before.is_active', true)->assertJsonPath('data.0.after.is_active', false)
            ->assertJsonMissingPath('data.0.grants');
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $target->id, 'action' => 'role_change', 'outcome' => 'success']);
        $this->patchJson($path, $this->body($target))->assertConflict();
        $this->patchJson('/api/v1/admin/accounts/'.$admin->uuid, [...$this->body($admin), 'role' => 'reviewer'])->assertUnprocessable();
        $this->patchJson('/api/v1/admin/accounts/'.$admin->uuid, [...$this->body($admin), 'is_active' => false])->assertUnprocessable();
        $this->assertTrue($admin->fresh()->is_active);
        $this->assertSame('admin', $admin->fresh()->role);
    }

    public function test_disable_revokes_sessions_tokens_and_old_session_stays_dead_after_reenable(): void
    {
        $target = User::factory()->reviewer()->create();
        $admin = User::factory()->admin()->create();
        $token = $target->createToken('synthetic-token')->accessToken;
        DB::table('sessions')->insert(['id' => 'synthetic-session', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);
        $oldVersion = $target->auth_version;
        $this->actingAs($admin, 'web');
        $path = '/api/v1/admin/accounts/'.$target->uuid;
        $this->patchJson($path, [...$this->body($target), 'is_active' => false])->assertOk();
        $this->assertDatabaseMissing('sessions', ['user_id' => $target->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $token->id]);
        Auth::forgetGuards();
        $this->postJson('/login', ['email' => $target->email, 'password' => 'password'])
            ->assertForbidden()->assertJsonPath('message', 'Account disabled — contact your administrator.');
        $this->actingAs($admin, 'web');
        $this->patchJson($path, [...$this->body($target->fresh()), 'is_active' => true])->assertOk();
        Auth::forgetGuards();
        $this->actingAs($target->fresh(), 'web');
        $this->withSession([Auth::guard('web')->getName() => $target->id, 'auth.version' => $oldVersion]);
        $this->getJson('/api/v1/me')->assertUnauthorized();
        Auth::forgetGuards();
        $this->postJson('/login', ['email' => $target->email, 'password' => 'password'])->assertNoContent();
        $this->getJson('/api/v1/me')->assertOk();
    }

    public function test_bearer_header_cannot_bypass_cookie_session_revocation(): void
    {
        $target = User::factory()->reviewer()->create();
        $oldVersion = $target->auth_version;
        $target->forceFill(['is_active' => false])->save();
        $target->forceFill(['is_active' => true])->save();
        Auth::forgetGuards();
        $this->actingAs($target->fresh(), 'web');
        $this->withSession([Auth::guard('web')->getName() => $target->id, 'auth.version' => $oldVersion]);
        $this->withToken('invalid-synthetic-bearer')->postJson('/api/v1/auth/password', [
            'current_password' => 'password', 'password' => 'New-password-1234', 'password_confirmation' => 'New-password-1234',
        ])->assertUnauthorized();
        $this->assertTrue(Hash::check('password', $target->fresh()->password));
    }

    public function test_admin_can_approve_and_send_without_grants_but_reviewer_and_disabled_admin_cannot(): void
    {
        Queue::fake();
        $district = $this->pilotDistrict();
        $admin = User::factory()->admin()->create();
        $reviewer = User::factory()->reviewer()->create();
        $this->actingAs($admin, 'web');
        $version = $this->postJson('/api/v1/district-reports', ['week' => '2026-W40'])->assertCreated()->json('data');
        $path = '/api/v1/district-reports/'.$version['uuid'];
        $payload = ['content_hash' => $version['content_hash'], 'idempotency_key' => (string) Str::uuid()];
        Auth::guard('web')->logout();
        Auth::forgetGuards();
        foreach (['approve', 'send'] as $action) {
            $this->postJson($path.'/'.$action, $payload)->assertUnauthorized();
        }
        Auth::forgetGuards();
        $this->actingAs($reviewer, 'web');
        foreach (['approve', 'send'] as $action) {
            $this->postJson($path.'/'.$action, $payload)->assertForbidden();
        }
        Auth::forgetGuards();
        $this->actingAs($admin, 'web');
        $this->postJson($path.'/approve', $payload)->assertOk()->assertJsonMissingPath('data.approved_grant_id')->assertJsonMissingPath('data.district_id');
        config(['caneguard.weekly_send_enabled' => true]);
        DistrictRecipientSet::create(['district_id' => $district->id, 'recipients' => ['synthetic@example.test'], 'office_reference' => 'synthetic']);
        $this->postJson($path.'/send', $payload)->assertStatus(202)->assertJsonMissingPath('data.send_grant_id');
        $this->assertDatabaseCount('district_grants', 0);
        $admin->forceFill(['is_active' => false])->save();
        Auth::forgetGuards();
        $this->actingAs($admin->fresh(), 'web');
        $this->postJson($path.'/approve', $payload)->assertUnauthorized();
        $this->assertFalse($admin->fresh()->can('approve', DistrictReportVersion::where('uuid', $version['uuid'])->sole()));
    }

    public function test_another_active_admin_can_send_a_sealed_approval_after_original_approver_is_disabled(): void
    {
        Queue::fake();
        config(['caneguard.weekly_send_enabled' => true]);
        $district = $this->pilotDistrict();
        $approver = User::factory()->admin()->create();
        $sender = User::factory()->admin()->create();
        $workflow = app(DistrictReportWorkflow::class);
        $version = $workflow->prepare($approver, '2026-W40');
        $version = $workflow->approve($approver, $version, $version->content_hash);
        $approver->forceFill(['is_active' => false])->save();
        DistrictRecipientSet::create(['district_id' => $district->id, 'recipients' => ['synthetic@example.test'], 'office_reference' => 'synthetic']);
        $this->actingAs($sender, 'web');
        $id = $this->postJson('/api/v1/district-reports/'.$version->uuid.'/send', [
            'content_hash' => $version->content_hash, 'idempotency_key' => (string) Str::uuid(),
        ])->assertStatus(202)->json('data.id');
        $this->assertTrue($workflow->checkPending(DistrictReportTransmission::findOrFail($id)));
        $this->assertSame($approver->id, $version->fresh()->approved_by_id);
    }

    public function test_deprecated_v1_and_v2_writers_remain_functional_with_safe_warning_telemetry(): void
    {
        Log::spy();
        $this->pilotDistrict();
        $admin = User::factory()->admin()->create();
        $target = User::factory()->reviewer()->create();
        $this->actingAs($admin, 'web');
        $this->patchJson('/api/v1/admin/users/'.$target->uuid.'/role', ['role' => 'admin', 'current_password' => 'password'])
            ->assertOk()->assertHeader('Deprecation', 'true');
        $target->refresh();
        $this->putJson('/api/v2/admin/accounts/'.$target->uuid.'/access', [
            'contract_version' => 'accounts-access-v1', 'operation' => 'revoke',
            'desired' => ['role' => 'admin', 'grants' => []], 'current_password' => 'password',
            'office_reference' => 'synthetic', 'idempotency_key' => (string) Str::uuid(),
            'expected_access_version' => $target->access_version,
        ])->assertOk()->assertHeader('Deprecation', 'true')->assertJsonPath('data.is_active', false)
            ->assertJsonMissingPath('data.grant_revisions');
        Log::shouldHaveReceived('notice')->with('Deprecated account API called', \Mockery::on(fn ($context) => ! isset($context['current_password']) && $context['actor_id'] === $admin->id))->twice();
        $this->assertDatabaseHas('security_audits', ['target_user_id' => $target->id, 'action' => 'district_access_changed']);
    }

    private function body(User $user): array
    {
        return ['role' => $user->role, 'is_active' => true, 'current_password' => 'password', 'expected_access_version' => $user->access_version];
    }
}
