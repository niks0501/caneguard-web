<?php

namespace Tests\Feature;

use App\Models\DistrictRecipientSet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class DistrictReportEmailRetirementTest extends TestCase
{
    use RefreshDatabase;

    public function test_in_system_report_email_and_recipient_endpoints_return_410_gone_and_preserve_history(): void
    {
        Queue::fake();
        $district = $this->pilotDistrict();
        $admin = User::factory()->admin()->inDistrict($district)->create();
        $historicalSet = DistrictRecipientSet::query()->create([
            'district_id' => $district->id,
            'recipients' => ['legacy@example.test'],
            'office_reference' => 'historical-ref',
        ]);

        $this->actingAs($admin, 'web');
        $version = $this->postJson('/api/v1/district-reports', ['week' => '2026-W47'])->assertCreated()->json('data');
        $this->postJson('/api/v1/district-reports/'.$version['uuid'].'/approve', [
            'content_hash' => $version['content_hash'],
        ])->assertOk();

        $this->postJson('/api/v1/district-reports/'.$version['uuid'].'/send', [
            'content_hash' => $version['content_hash'],
            'idempotency_key' => (string) Str::uuid(),
        ])->assertStatus(410);

        $this->getJson('/api/v1/district-recipient-sets')->assertStatus(410);
        $this->postJson('/api/v1/district-recipient-sets/replace', [
            'recipients' => ['new@example.test'],
            'office_reference' => 'blocked',
            'current_password' => 'password',
        ])->assertStatus(410);

        $this->getJson('/api/v1/district-reports')
            ->assertOk()
            ->assertJsonPath('meta.email_send_retired', true)
            ->assertJsonPath('meta.send_enabled', false)
            ->assertJsonPath('meta.automation.enabled', true)
            ->assertJsonPath('meta.automation.day', 1)
            ->assertJsonPath('meta.automation.time', '06:00');

        $this->assertDatabaseHas('district_recipient_sets', ['id' => $historicalSet->id]);
        $this->assertDatabaseCount('district_report_transmissions', 0);
        Queue::assertNothingPushed();
    }
}
