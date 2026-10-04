<?php

namespace Tests\Feature;

use App\Actions\Auth\IssueMobileToken;
use App\Actions\Auth\ReconcileDistrictAccess;
use App\Models\District;
use App\Models\DistrictMembership;
use App\Models\Report;
use App\Models\User;
use App\Notifications\NewCaseSubmittedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DistrictAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_remains_closed_until_both_office_gates_open_and_never_creates_staff(): void
    {
        Notification::fake();
        config(['caneguard.self_registration_enabled' => true, 'caneguard.pilot_roster_certified' => false]);
        $payload = ['name' => 'Farmer', 'email' => 'farmer@example.test', 'password' => 'An eligible farmer passphrase',
            'role' => 'admin', 'grants' => ['*', 'staff:manage', 'report:send'], 'district_id' => 1];
        $this->postJson('/register', $payload)->assertForbidden()->assertJsonPath('code', 'REGISTRATION_DISABLED');
        $this->assertDatabaseCount('users', 0);
        config(['caneguard.pilot_roster_certified' => true]);
        $this->postJson('/register', $payload)->assertCreated()->assertJsonPath('user.role', 'farmer');
        $this->assertDatabaseCount('district_memberships', 0);
        $this->assertDatabaseCount('district_grants', 0);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $user = User::query()->sole();
        $user->markEmailAsVerified();
        $token = app(IssueMobileToken::class)->handle($user, 'Farmer device', 'farmer-device');
        $this->assertSame(['account:security'], $token->accessToken->abilities);
        $this->withToken($token->plainTextToken)->getJson('/api/v1/mobile/auth/me')->assertOk()
            ->assertJsonPath('user.role', 'farmer')->assertJsonPath('user.capabilities', []);
        $this->assertTrue($token->accessToken->expires_at->equalTo($token->accessToken->created_at->copy()->addDays(30)));
    }

    public function test_unsigned_private_route_families_are_closed(): void
    {
        $report = Report::factory()->create();
        foreach ($this->privateReads($report) as $path) {
            $this->getJson($path)->assertUnauthorized();
        }
        $this->postJson('/api/v1/mobile/reports', [])->assertUnauthorized();
        $this->postJson('/api/v2/mobile/reports', [])->assertUnauthorized();
    }

    public function test_farmer_denied_official_report_for_real_pat_and_cookie_even_with_forged_wildcard(): void
    {
        Storage::fake('local');
        $district = $this->pilotDistrict();
        $farmer = User::factory()->farmer()->inDistrict($district)->create();
        $report = Report::factory()->inDistrict($district)->create();
        foreach (['pat', 'cookie'] as $flow) {
            $this->withoutToken();
            Auth::forgetGuards();
            if ($flow === 'pat') {
                $token = $farmer->createToken('forged-wildcard', ['*']);
                $this->withToken($token->plainTextToken);
            } else {
                $this->actingAs($farmer, 'web');
            }
            foreach ($this->privateReads($report) as $path) {
                if ($path === '/api/v1/reference/locations') {
                    continue; // Location vocabulary is not a private record or staff authority.
                }
                $this->getJson($path)->assertForbidden();
            }
            foreach (['/api/v1/mobile/reports', '/api/v2/mobile/reports', '/api/v1/district-reports',
                "/api/v1/reports/{$report->uuid}/handoff-notes"] as $path) {
                $this->postJson($path, ['district_id' => $district->id, 'reporter_id' => $report->reporter_id])->assertForbidden();
            }
            $this->patchJson("/api/v1/reports/{$report->uuid}/review", [])->assertForbidden();
        }
        $this->assertDatabaseCount('reports', 1);
        $this->assertDatabaseCount('report_handoff_notes', 0);
        $this->assertDatabaseCount('report_audits', 0);
        $this->assertDatabaseCount('district_report_transmissions', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_verified_inspector_carries_over_but_unverified_and_unassigned_official_access_denies(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create(['password' => 'An inspector passphrase']);
        $own = Report::factory()->inDistrict($district)->create(['reporter_id' => $inspector->id, 'updated_at' => now()->subMinute()]);
        $other = Report::factory()->inDistrict($district)->create();
        $unassigned = Report::factory()->create(['reporter_id' => $inspector->id]);
        $foreign = District::query()->create(['code' => 'foreign', 'name' => 'Foreign district']);
        $foreignReport = Report::factory()->inDistrict($foreign)->create(['reporter_id' => $inspector->id]);
        $token = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $inspector->email, 'password' => 'An inspector passphrase', 'device_name' => 'Inspector device',
        ])->assertOk()->assertJsonPath('user.role', 'field_reporter')->json('token');
        foreach ([1, 2, 3] as $version) {
            $this->withToken($token)->getJson("/api/v{$version}/mobile/reports/statuses")->assertOk()
                ->assertJsonFragment(['client_uuid' => $own->client_uuid])
                ->assertJsonMissing(['client_uuid' => $other->client_uuid])
                ->assertJsonMissing(['client_uuid' => $unassigned->client_uuid])
                ->assertJsonMissing(['client_uuid' => $foreignReport->client_uuid]);
        }
        $this->withoutToken();
        Auth::forgetGuards();
        $held = User::factory()->unverified()->inDistrict($district)->create(['password' => 'A held inspector passphrase']);
        $this->postJson('/api/v1/mobile/auth/login', ['email' => $held->email, 'password' => 'A held inspector passphrase', 'device_name' => 'Held'])
            ->assertForbidden()->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');
        $unclassified = User::factory()->create();
        $heldToken = app(IssueMobileToken::class)->handle($unclassified, 'Unassigned', 'unassigned');
        $this->withToken($heldToken->plainTextToken)->getJson('/api/v1/mobile/reports/statuses')->assertForbidden();
        $this->assertSame(['account:security'], $heldToken->accessToken->abilities);
        $this->assertSame($inspector->id, $own->fresh()->reporter_id);
    }

    public function test_one_pilot_scope_covers_office_lists_details_images_documents_and_stale_notifications(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->reviewer()->inDistrict($district)->create();
        $pilot = Report::factory()->inDistrict($district)->create(['submitted_at' => now()]);
        $foreign = District::query()->create(['code' => 'foreign', 'name' => 'Foreign district']);
        $foreignReport = Report::factory()->inDistrict($foreign)->create(['submitted_at' => now()]);
        $unassigned = Report::factory()->create(['submitted_at' => now()]);
        foreach ([$pilot, $foreignReport, $unassigned] as $report) {
            $reviewer->notify(new NewCaseSubmittedNotification($report->uuid, $report->reference_code));
        }
        $this->actingAs($reviewer, 'web');
        $this->getJson('/api/v1/reports')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.uuid', $pilot->uuid);
        $this->getJson('/api/v1/dashboard/summary')->assertOk()->assertJsonPath('data.counts.total_submitted', 1);
        $this->getJson('/api/v1/reports/map')->assertOk()->assertJsonPath('metadata.total_count', 1);
        $this->getJson('/api/v1/reports/analytics?from=2026-01-01&to=2026-12-31')->assertOk()->assertJsonMissing(['uuid' => $foreignReport->uuid]);
        $this->getJson('/api/v1/notifications')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.unread_count', 1);
        foreach ([$foreignReport, $unassigned] as $report) {
            foreach (['', '/image', '/validation-photo', '/referral/summary', '/referral-summary', '/possible-matches'] as $suffix) {
                $this->getJson("/api/v1/reports/{$report->uuid}{$suffix}")->assertForbidden();
            }
            $this->postJson("/api/v1/reports/{$report->uuid}/handoff-notes", [])->assertForbidden();
        }
        $export = $this->get('/api/v1/reports/export')->assertOk()->streamedContent();
        $this->assertStringContainsString($pilot->reference_code, $export);
        $this->assertStringNotContainsString($foreignReport->reference_code, $export);
        $this->assertStringNotContainsString($unassigned->reference_code, $export);
        $this->get('/api/v1/reports/documents/report?period_type=weekly')->assertOk();
        DistrictMembership::query()->where('user_id', $reviewer->id)->firstOrFail()->update(['revoked_at' => now()]);
        $this->getJson('/api/v1/reports')->assertForbidden();
    }

    public function test_roster_and_grant_changes_are_audited_revoke_auth_and_never_reactivate_retired_experts(): void
    {
        $district = $this->pilotDistrict();
        $user = User::factory()->create();
        $token = $user->createToken('old')->plainTextToken;
        DB::table('sessions')->insert(['id' => 'old-session', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
        app(ReconcileDistrictAccess::class)->handle($user, $district, 'field_reporter', [], false, 'test-office-decision');
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseCount('sessions', 0);
        $this->assertDatabaseHas('security_audits', ['action' => 'district_access_changed', 'target_user_id' => $user->id]);
        $this->withToken($token)->getJson('/api/v1/mobile/auth/me')->assertUnauthorized();
        $disabled = User::factory()->create(['role' => 'disabled']);
        $this->expectException(\InvalidArgumentException::class);
        app(ReconcileDistrictAccess::class)->handle($disabled, $district, 'reviewer', [], false, 'must-not-reactivate');
    }

    public function test_all_pat_entry_points_deny_null_overlong_and_thirty_day_old_credentials(): void
    {
        $user = User::factory()->farmer()->create();
        foreach (['null', 'overlong', 'aged', 'expired'] as $kind) {
            $token = $user->createToken('invalid-'.$kind, ['*']);
            $token->accessToken->forceFill(match ($kind) {
                'null' => ['expires_at' => null],
                'overlong' => ['expires_at' => now()->addDays(31)],
                'aged' => ['created_at' => now()->subDays(31), 'expires_at' => now()->addDay()],
                'expired' => ['expires_at' => now()->subSecond()],
            })->save();
            Auth::forgetGuards();
            $this->withToken($token->plainTextToken)->getJson('/api/v1/mobile/auth/me')->assertUnauthorized();
            Auth::forgetGuards();
            $this->withToken($token->plainTextToken)->postJson('/api/v1/auth/password', [])->assertUnauthorized();
        }
        $clamped = $user->createToken('clamped', ['*'], now()->addDays(60));
        $this->assertTrue($clamped->accessToken->expires_at->lessThanOrEqualTo(now()->addDays(30)));
    }

    private function privateReads(Report $report): array
    {
        return ['/api/v1/reports', '/api/v1/reports/map', '/api/v1/reports/summary', '/api/v1/reports/analytics',
            '/api/v1/reports/export', '/api/v1/reports/documents/report', '/api/v1/reports/documents/report/pdf',
            '/api/v1/reports/field-validation-queue', '/api/v1/dashboard/summary', '/api/v1/field-reporters',
            '/api/v1/notifications', '/api/v1/mobile/notifications', '/api/v1/mobile/assignments',
            '/api/v1/mobile/reports/statuses', '/api/v2/mobile/reports/statuses', '/api/v3/mobile/reports/statuses',
            '/api/v1/mobile/reports/possible-matches', '/api/v1/district-reports', '/api/v1/reference/locations',
            "/api/v1/reports/{$report->uuid}", "/api/v1/reports/{$report->uuid}/image",
            "/api/v1/reports/{$report->uuid}/referral-summary", "/api/v1/reports/{$report->uuid}/validation-photo"];
    }
}
