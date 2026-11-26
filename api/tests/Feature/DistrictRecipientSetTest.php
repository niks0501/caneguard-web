<?php

namespace Tests\Feature;

use App\Models\DistrictRecipientSet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DistrictRecipientSetTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/district-recipient-sets';

    private function payload(array $override = []): array
    {
        return [...['recipients' => ['office@example.test', 'chief@example.test'], 'office_reference' => 'synthetic-office-ref', 'current_password' => 'password'], ...$override];
    }

    private function admin(): User
    {
        $admin = User::factory()->admin()->inDistrict($this->pilotDistrict())->create();
        $this->actingAs($admin, 'web');

        return $admin;
    }

    public function test_recipient_set_endpoints_are_retired_with_410_and_historical_rows_remain_immutable(): void
    {
        $district = $this->pilotDistrict();
        $admin = User::factory()->admin()->inDistrict($district)->create();
        $set = DistrictRecipientSet::query()->create([
            'district_id' => $district->id,
            'recipients' => ['office@example.test'],
            'office_reference' => 'historical-set',
        ]);

        $this->actingAs($admin, 'web');
        $this->getJson(self::URL)->assertStatus(410);
        $this->postJson(self::URL.'/replace', $this->payload())->assertStatus(410);
        $this->getJson('/api/v1/district-reports')->assertOk()
            ->assertJsonPath('meta.email_send_retired', true)
            ->assertJsonPath('meta.send_enabled', false);

        $this->expectException(\LogicException::class);
        $set->update(['recipients' => ['edit@example.test']]);
    }

    public function test_sets_cannot_be_deleted(): void
    {
        $district = $this->pilotDistrict();
        DistrictRecipientSet::query()->create([
            'district_id' => $district->id,
            'recipients' => ['office@example.test'],
            'office_reference' => 'historical-set',
        ]);
        $this->expectException(\LogicException::class);
        DistrictRecipientSet::query()->firstOrFail()->delete();
    }

    public function test_non_admins_remain_forbidden_and_guests_unauthorized_on_retired_recipient_routes(): void
    {
        $district = $this->pilotDistrict();
        foreach ([User::factory()->reviewer()->inDistrict($district)->create(), User::factory()->fieldReporter()->inDistrict($district)->create()] as $user) {
            \Auth::forgetGuards();
            $this->actingAs($user, 'web');
            $this->getJson(self::URL)->assertForbidden();
            $this->postJson(self::URL.'/replace', $this->payload())->assertForbidden();
        }
        \Auth::forgetGuards();
        $this->app['auth']->forgetGuards();
        $this->postJson(self::URL.'/replace', $this->payload())->assertUnauthorized();
        $this->assertDatabaseCount('district_recipient_sets', 0);
    }
}
