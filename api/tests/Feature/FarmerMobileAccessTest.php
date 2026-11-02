<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FarmerMobileAccessTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'A farmer passphrase for tests';

    public function test_verified_farmer_logs_in_receives_token_and_reads_own_session(): void
    {
        $farmer = User::factory()->farmer()->create(['password' => self::PASSWORD]);

        $token = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $farmer->email,
            'password' => self::PASSWORD,
            'device_name' => 'Farmer phone',
            'device_id' => 'farmer-phone-1',
        ])->assertOk()
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonPath('user.role', 'farmer')
            ->assertJsonPath('user.capabilities', [])
            ->json('token');

        $this->assertNotEmpty($token);
        $this->assertSame(['account:security'], $farmer->tokens()->firstOrFail()->abilities);

        $this->withToken($token)->getJson('/api/v1/mobile/auth/me')->assertOk()
            ->assertJsonPath('user.uuid', $farmer->uuid)
            ->assertJsonPath('user.role', 'farmer');
    }

    public function test_unverified_farmer_cannot_log_in(): void
    {
        $farmer = User::factory()->farmer()->unverified()->create(['password' => self::PASSWORD]);

        $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $farmer->email,
            'password' => self::PASSWORD,
            'device_name' => 'Farmer phone',
        ])->assertForbidden()->assertJsonPath('code', 'EMAIL_NOT_VERIFIED');
    }

    public function test_farmer_token_is_refused_on_every_inspector_only_official_path(): void
    {
        $district = $this->pilotDistrict();
        $farmer = User::factory()->farmer()->inDistrict($district)->create(['password' => self::PASSWORD]);
        $report = Report::factory()->inDistrict($district)->create();
        $token = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $farmer->email,
            'password' => self::PASSWORD,
            'device_name' => 'Farmer phone',
            'device_id' => 'farmer-phone-1',
        ])->assertOk()->json('token');

        $this->withToken($token);
        foreach ([
            '/api/v1/mobile/reports/statuses',
            '/api/v2/mobile/reports/statuses',
            '/api/v1/mobile/assignments',
            '/api/v1/mobile/notifications',
        ] as $path) {
            $this->getJson($path)->assertForbidden();
        }
        foreach ([
            '/api/v1/mobile/reports',
            '/api/v2/mobile/reports',
            '/api/v1/mobile/field-surveys',
            '/api/v1/district-reports',
            "/api/v1/reports/{$report->uuid}/handoff-notes",
        ] as $path) {
            $this->postJson($path, [])->assertForbidden();
        }
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [])->assertForbidden();
        $this->assertDatabaseCount('reports', 1);
    }

    public function test_inspector_keeps_report_capabilities_and_access(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create(['password' => self::PASSWORD]);

        $token = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $inspector->email,
            'password' => self::PASSWORD,
            'device_name' => 'Inspector phone',
            'device_id' => 'inspector-phone-1',
        ])->assertOk()->assertJsonPath('user.role', 'field_reporter')->json('token');

        $this->assertContains('report:submit', $inspector->tokens()->firstOrFail()->abilities);
        $this->withToken($token)->getJson('/api/v1/mobile/reports/statuses')->assertOk();
    }
}
