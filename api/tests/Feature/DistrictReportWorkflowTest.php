<?php

namespace Tests\Feature;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\DistrictRecipientSet;
use App\Models\DistrictReportTransmission;
use App\Models\DistrictReportVersion;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class DistrictReportWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
    }

    public function test_reviewer_never_approves_or_sends_even_with_named_grants(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->reviewer()->inDistrict($district)->create();
        $this->actingAs($reviewer, 'web');
        $version = $this->postJson('/api/v1/district-reports', ['week' => '2026-W40'])->assertCreated()->json('data');
        foreach ([$reviewer] as $actor) {
            if ($actor->role === 'reviewer') {
                // Raw erroneous roster data cannot elevate the reviewer role.
                foreach (['report:approve', 'report:send'] as $ability) {
                    DistrictGrant::query()->create(['user_id' => $actor->id, 'district_id' => $district->id, 'ability' => $ability]);
                }
            }
            Auth::forgetGuards();
            $this->actingAs($actor, 'web');
            foreach (['approve', 'send'] as $action) {
                $this->postJson('/api/v1/district-reports/'.$version['uuid'].'/'.$action, [
                    'content_hash' => $version['content_hash'], 'idempotency_key' => (string) Str::uuid(),
                ])->assertForbidden();
            }
        }
        $this->assertDatabaseCount('district_report_transmissions', 0);
        $this->assertDatabaseMissing('district_report_events', ['action' => 'approved']);
        $this->assertDatabaseMissing('district_report_events', ['action' => 'send_requested']);
    }

    public function test_named_officer_approves_exact_version_then_records_one_idempotent_send_intent_without_mail(): void
    {
        Mail::fake();
        config(['caneguard.weekly_send_enabled' => true]);
        [$officer, $district] = $this->officer();
        DistrictRecipientSet::query()->create(['district_id' => $district->id, 'recipients' => ['authorized@example.test'], 'office_reference' => 'test-recipient-decision']);
        Report::factory()->inDistrict($district)->create(['submitted_at' => '2026-09-29 10:00:00']);
        $this->actingAs($officer, 'web');
        $version = $this->prepare();
        $payload = ['content_hash' => $version['content_hash'], 'idempotency_key' => (string) Str::uuid(),
            'sender_id' => 99999, 'recipients' => ['forged@example.test']];
        $path = '/api/v1/district-reports/'.$version['uuid'];
        $this->postJson($path.'/send', $payload)->assertConflict();
        $this->postJson($path.'/approve', ['content_hash' => str_repeat('0', 64)])->assertConflict();
        $this->postJson($path.'/approve', $payload)->assertOk()->assertJsonPath('data.approved_by_id', $officer->id);
        $intent = $this->postJson($path.'/send', $payload)->assertStatus(202)->assertJsonPath('data.state', 'pending')
            ->assertJsonPath('data.requested_by_id', $officer->id)->json('data');
        $this->postJson($path.'/send', $payload)->assertStatus(202)->assertJsonPath('data.id', $intent['id']);
        $this->postJson($path.'/send', [...$payload, 'idempotency_key' => (string) Str::uuid()])->assertConflict();
        $this->assertDatabaseCount('district_report_transmissions', 1);
        $this->assertDatabaseHas('district_report_events', ['action' => 'approved', 'actor_id' => $officer->id, 'actor_role' => 'admin', 'content_hash' => $version['content_hash']]);
        $this->assertDatabaseHas('district_report_events', ['action' => 'send_requested', 'idempotency_key' => $payload['idempotency_key']]);
        $stored = DistrictReportTransmission::findOrFail($intent['id']);
        $this->assertTrue(app(DistrictReportWorkflow::class)->checkPending($stored));
        $this->assertSame(['authorized@example.test'], DistrictRecipientSet::findOrFail($stored->district_recipient_set_id)->recipients);
        $this->get($path.'/document')->assertOk()
            ->assertHeader('cache-control', 'no-store, private')
            ->assertSee('caneguard-report-close');
        Mail::assertNothingSent();
        Mail::assertNothingQueued();
    }

    public function test_send_gate_and_missing_recipient_contract_never_queue_placeholder_authority(): void
    {
        [$officer] = $this->officer();
        $this->actingAs($officer, 'web');
        $version = $this->prepare();
        $payload = ['content_hash' => $version['content_hash'], 'idempotency_key' => (string) Str::uuid()];
        $path = '/api/v1/district-reports/'.$version['uuid'];
        $this->postJson($path.'/approve', $payload)->assertOk();
        $this->postJson($path.'/send', $payload)->assertStatus(503);
        config(['caneguard.weekly_send_enabled' => true]);
        $this->postJson($path.'/send', $payload)->assertConflict();
        $this->assertDatabaseCount('district_report_transmissions', 0);
        $this->assertDatabaseCount('district_recipient_sets', 0);
    }

    public function test_domain_versions_require_valid_content_and_current_evidence_not_memberships(): void
    {
        config(['caneguard.weekly_send_enabled' => true]);
        [$officer, $district] = $this->officer();
        $this->actingAs($officer, 'web');
        $version = $this->prepare();
        $payload = ['content_hash' => $version['content_hash'], 'idempotency_key' => (string) Str::uuid()];
        $path = '/api/v1/district-reports/'.$version['uuid'];
        $this->postJson($path.'/approve', $payload)->assertOk();
        Report::factory()->inDistrict($district)->create(['submitted_at' => '2026-09-29 10:00:00']);
        $this->prepare();
        $this->postJson($path.'/send', $payload)->assertConflict();
        $foreign = District::query()->create(['code' => 'foreign', 'name' => 'Foreign district']);
        $foreignVersion = DistrictReportVersion::query()->create([
            'district_id' => $foreign->id, 'week_start' => '2026-09-28', 'version' => 1,
            'content' => [], 'source_refs' => [], 'content_hash' => str_repeat('a', 64), 'prepared_by_id' => $officer->id,
        ]);
        foreach (['approve', 'send'] as $action) {
            $this->postJson('/api/v1/district-reports/'.$foreignVersion->uuid.'/'.$action, $payload)->assertConflict();
        }
        $this->get('/api/v1/district-reports/'.$foreignVersion->uuid.'/document')->assertConflict();
        $this->getJson('/api/v1/district-reports')->assertOk()->assertJsonCount(2, 'data');
        $this->assertDatabaseCount('district_report_transmissions', 0);
        $this->assertDatabaseCount('district_grants', 2);
    }

    public function test_changed_source_evidence_invalidates_an_approved_version(): void
    {
        config(['caneguard.weekly_send_enabled' => true]);
        [$officer, $district] = $this->officer();
        $report = Report::factory()->inDistrict($district)->create(['submitted_at' => '2026-09-29 10:00:00']);
        $this->actingAs($officer, 'web');
        $version = $this->prepare();
        $payload = ['content_hash' => $version['content_hash'], 'idempotency_key' => (string) Str::uuid()];
        $path = '/api/v1/district-reports/'.$version['uuid'];
        $this->postJson($path.'/approve', $payload)->assertOk();
        $report->update(['review_notes' => 'Updated office decision', 'lock_version' => 1]);
        $this->postJson($path.'/send', $payload)->assertConflict();
        $this->assertDatabaseCount('district_report_transmissions', 0);
    }

    public function test_disabled_sender_cancels_queued_intent_and_reenable_does_not_resurrect_it(): void
    {
        config(['caneguard.weekly_send_enabled' => true]);
        [$officer, $district] = $this->officer();
        DistrictRecipientSet::query()->create(['district_id' => $district->id, 'recipients' => ['authorized@example.test'], 'office_reference' => 'test-recipient-decision']);
        $this->actingAs($officer, 'web');
        $version = $this->prepare();
        $payload = ['content_hash' => $version['content_hash'], 'idempotency_key' => (string) Str::uuid()];
        $path = '/api/v1/district-reports/'.$version['uuid'];
        $this->postJson($path.'/approve', $payload)->assertOk();
        $id = $this->postJson($path.'/send', $payload)->assertStatus(202)->json('data.id');
        $token = $officer->createToken('old');
        $officer->forceFill(['is_active' => false])->save();
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $token->accessToken->id]);
        $intent = DistrictReportTransmission::findOrFail($id);
        $this->assertFalse(app(DistrictReportWorkflow::class)->checkPending($intent));
        $this->assertSame('cancelled', $intent->fresh()->state);
        $this->assertDatabaseHas('district_report_events', ['action' => 'cancelled', 'actor_id' => $officer->id]);
        $officer->forceFill(['is_active' => true])->save();
        $this->assertFalse(app(DistrictReportWorkflow::class)->checkPending($intent));
    }

    public function test_office_roles_are_cookie_web_only_and_self_changes_are_validation_errors(): void
    {
        [$officer, $district] = $this->officer();
        $target = User::factory()->reviewer()->inDistrict($district)->create();
        $this->actingAs($officer, 'web');
        $this->patchJson('/api/v1/admin/users/'.$target->uuid.'/role', ['role' => 'admin', 'current_password' => 'password'])->assertOk();
        $this->putJson('/api/v1/admin/users/'.$officer->uuid.'/access', [])->assertUnprocessable();
        Auth::guard('web')->logout();
        Auth::forgetGuards();
        $this->withToken($officer->createToken('forged-office-mobile', ['*'])->plainTextToken)->getJson('/api/v1/reports')->assertForbidden();
        Auth::forgetGuards();
        $this->getJson('/api/v1/mobile/auth/me')->assertForbidden();
    }

    public function test_sealed_content_cannot_be_modified(): void
    {
        [$officer] = $this->officer();
        $this->actingAs($officer, 'web');
        $version = DistrictReportVersion::query()->where('uuid', $this->prepare()['uuid'])->sole();
        $this->expectException(\LogicException::class);
        $version->update(['content' => ['forged' => true]]);
    }

    public function test_preparation_uses_its_explicit_actor_without_an_ambient_http_identity(): void
    {
        [$officer, $district] = $this->officer();
        $pilot = Report::factory()->inDistrict($district)->create(['submitted_at' => '2026-09-29 10:00:00']);
        Report::factory()->create(['submitted_at' => '2026-09-29 10:00:00']);
        $version = app(DistrictReportWorkflow::class)->prepare($officer, '2026-W40');
        $this->assertSame([$pilot->uuid], array_column($version->source_refs, 'uuid'));
        $this->assertSame(1, $version->content['case_universe']['cases']);
        $this->assertSame($officer->name, $version->prepared_name);
    }

    public function test_retired_recipient_contracts_cannot_be_resurrected(): void
    {
        [, $district] = $this->officer();
        $set = DistrictRecipientSet::query()->create(['district_id' => $district->id, 'recipients' => ['authorized@example.test'], 'office_reference' => 'test-reference']);
        $set->update(['revoked_at' => now()]);
        $this->expectException(\LogicException::class);
        $set->update(['revoked_at' => null]);
    }

    private function officer(): array
    {
        $district = $this->pilotDistrict();
        $officer = User::factory()->admin()->inDistrict($district)->create();
        foreach (['report:approve', 'report:send'] as $ability) {
            DistrictGrant::query()->create(['user_id' => $officer->id, 'district_id' => $district->id, 'ability' => $ability]);
        }

        return [$officer, $district];
    }

    private function prepare(): array
    {
        return $this->postJson('/api/v1/district-reports', ['week' => '2026-W40'])->assertCreated()->json('data');
    }
}
