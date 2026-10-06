<?php

namespace Tests\Feature;

use App\Models\DistrictGrant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

class DistrictReportingSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_schedule_is_unconfigured_until_admin_saves_with_password_step_up(): void
    {
        $district = $this->pilotDistrict();
        $manager = User::factory()->admin()->inDistrict($district)->create();
        $grant = DistrictGrant::query()->create(['user_id' => $manager->id, 'district_id' => $district->id, 'ability' => 'staff:manage']);
        $this->actingAs($manager, 'web');
        $this->getJson('/api/v1/district-reporting-settings')->assertOk()->assertJsonPath('data.reminder_day', null)->assertJsonPath('data.timezone', 'Asia/Manila');
        $payload = ['reminder_day' => 2, 'reminder_time' => '13:30', 'office_reference' => 'synthetic-office-decision', 'current_password' => 'password'];
        $this->putJson('/api/v1/district-reporting-settings', [...$payload, 'current_password' => 'wrong'])->assertForbidden();
        $this->putJson('/api/v1/district-reporting-settings', $payload)->assertOk()->assertJsonPath('data.reminder_day', 2)->assertJsonPath('data.reminder_time', '13:30');
        $this->assertDatabaseHas('district_reporting_settings', ['district_id' => $district->id, 'updated_by_id' => $manager->id, 'reminder_day' => 2]);
        $this->assertDatabaseHas('security_audits', ['actor_id' => $manager->id, 'action' => 'district_reporting_settings_changed', 'outcome' => 'success']);
        $this->assertDatabaseCount('district_report_versions', 0);
        $this->assertDatabaseCount('district_report_transmissions', 0);
        $this->assertFalse(config('caneguard.weekly_send_enabled'));
        $grant->update(['revoked_at' => now()]);
        $this->putJson('/api/v1/district-reporting-settings', $payload)->assertOk();
        $manager->forceFill(['is_active' => false])->save();
        $this->actingAs($manager->fresh(), 'web');
        $this->putJson('/api/v1/district-reporting-settings', $payload)->assertUnauthorized();
    }

    public function test_reviewers_cannot_read_or_change_admin_settings_even_with_erroneous_grants(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->reviewer()->inDistrict($district)->create();
        DistrictGrant::query()->create(['user_id' => $reviewer->id, 'district_id' => $district->id, 'ability' => 'staff:manage']);
        $this->actingAs($reviewer, 'web');
        $this->getJson('/api/v1/district-reporting-settings')->assertForbidden();
        $this->putJson('/api/v1/district-reporting-settings', [])->assertForbidden();
        $inspector = User::factory()->fieldReporter()->inDistrict($district)->create();
        Auth::forgetGuards();
        $this->actingAs($inspector, 'web');
        $this->getJson('/api/v1/district-reporting-settings')->assertForbidden();
    }
}
