<?php

namespace Tests\Feature;

use App\Models\Advisory;
use App\Models\FarmerAdvisoryBroadcast;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class FarmerBroadcastTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'A farmer passphrase for tests';

    private function office(?User $user = null): User
    {
        $user ??= User::factory()->reviewer()->create();
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user, 'web');

        return $user;
    }

    private function farmerToken(?string $barangay = null): array
    {
        $farmer = User::factory()->farmer()->create(['password' => self::PASSWORD, 'barangay' => $barangay]);
        $this->app['auth']->forgetGuards();
        $token = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $farmer->email, 'password' => self::PASSWORD, 'device_name' => 'Phone', 'device_id' => 'phone-'.$farmer->id,
        ])->assertOk()->json('token');

        return [$farmer, $token];
    }

    private function asToken(string $token): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function payload(Advisory $advisory, array $override = []): array
    {
        return array_merge([
            'advisory_uuid' => $advisory->uuid,
            'headline_tl' => 'Paalala sa Smut',
            'headline_en' => 'Smut reminder',
            'body_tl' => 'Putulin at ibalot ang may itim na usbong.',
            'body_en' => 'Cut and bag shoots with black whips.',
            'barangays' => ['Aga', 'Banilad'],
        ], $override);
    }

    public function test_a_reviewer_publishes_a_validated_advisory_to_named_barangays_and_sees_the_reach(): void
    {
        User::factory()->farmer()->create(['barangay' => 'Aga']);
        User::factory()->farmer()->create(['barangay' => 'Banilad']);
        User::factory()->farmer()->create(['barangay' => 'Tumalim']);
        User::factory()->farmer()->create(['barangay' => 'Aga', 'is_active' => false]);
        User::factory()->farmer()->unverified()->create(['barangay' => 'Aga']);
        $this->office();
        $advisory = Advisory::factory()->validated()->create();

        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory))->assertCreated()
            ->assertJsonPath('data.reach', 2)->assertJsonPath('data.live', true)
            ->assertJsonPath('data.barangays', ['Aga', 'Banilad']);

        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory, ['barangays' => [], 'all_barangays' => true]))->assertCreated()
            ->assertJsonPath('data.reach', 3)->assertJsonPath('data.barangays', null);
        $this->getJson('/api/v1/farmer-broadcasts')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_only_validated_advisories_and_a_deliberate_reach_are_accepted(): void
    {
        $this->office();
        $validated = Advisory::factory()->validated()->create();

        $this->postJson('/api/v1/farmer-broadcasts', $this->payload(Advisory::factory()->create()))->assertUnprocessable();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload(Advisory::factory()->retired()->create()))->assertUnprocessable();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($validated, ['advisory_uuid' => (string) Str::uuid()]))->assertUnprocessable();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($validated, ['barangays' => []]))->assertUnprocessable();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($validated, ['all_barangays' => true]))->assertUnprocessable();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($validated, ['barangays' => ['Atlantis']]))->assertUnprocessable();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($validated, ['headline_tl' => '   ']))->assertUnprocessable();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($validated, ['expires_in_days' => 61]))->assertUnprocessable();
        $this->assertSame(0, FarmerAdvisoryBroadcast::query()->count());
    }

    public function test_a_farmer_reads_guidance_for_their_home_barangay_in_both_languages(): void
    {
        $this->office();
        $advisory = Advisory::factory()->validated()->create();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory))->assertCreated();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory, ['barangays' => ['Tumalim'], 'headline_en' => 'Elsewhere']))->assertCreated();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory, ['barangays' => [], 'all_barangays' => true, 'headline_en' => 'Everyone']))->assertCreated();

        [, $aga] = $this->farmerToken('Aga');
        $headlines = collect($this->asToken($aga)->getJson('/api/v1/mobile/farmer/advisories')->assertOk()->assertJsonPath('home_barangay', 'Aga')->json('data'))->pluck('headline_en')->sort()->values()->all();
        $this->assertSame(['Everyone', 'Smut reminder'], $headlines);

        // No home barangay yet: only guidance for everyone, and nothing that names a neighbour.
        [, $none] = $this->farmerToken();
        $response = $this->asToken($none)->getJson('/api/v1/mobile/farmer/advisories')->assertOk();
        $this->assertSame(['Everyone'], collect($response->json('data'))->pluck('headline_en')->all());
        $this->assertArrayHasKey('headline_tl', $response->json('data.0'));
        $this->assertStringNotContainsString('Tumalim', $response->getContent());
        $this->assertArrayNotHasKey('barangays', $response->json('data.0'));
    }

    public function test_withdrawn_expired_and_retired_guidance_disappears_from_the_phone(): void
    {
        $this->office();
        $advisory = Advisory::factory()->validated()->create();
        $withdrawn = $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory))->assertCreated()->json('data.uuid');
        $expiring = $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory, ['expires_in_days' => 1]))->assertCreated()->json('data.uuid');
        [, $token] = $this->farmerToken('Aga');
        $count = fn () => count($this->asToken($token)->getJson('/api/v1/mobile/farmer/advisories')->assertOk()->json('data'));
        $this->assertSame(2, $count());

        $this->office();
        $this->postJson("/api/v1/farmer-broadcasts/{$withdrawn}/retire")->assertOk()->assertJsonPath('data.live', false);
        $this->postJson("/api/v1/farmer-broadcasts/{$withdrawn}/retire")->assertOk();
        $this->assertSame(1, $count());

        $this->travel(25)->hours();
        $this->assertSame(0, $count());
        $this->travelBack();
        $this->assertSame(1, $count());

        // Retiring the underlying advisory hides every broadcast built on it at once.
        $advisory->forceFill(['status' => Advisory::STATUS_RETIRED, 'retired_at' => now()])->save();
        $this->assertSame(0, $count());
        $this->assertNotNull(FarmerAdvisoryBroadcast::query()->where('uuid', $expiring)->first());
    }

    public function test_only_web_staff_publish_and_only_farmers_read(): void
    {
        $advisory = Advisory::factory()->validated()->create();
        [, $farmerToken] = $this->farmerToken('Aga');

        $this->asToken($farmerToken)->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory))->assertForbidden();
        $this->office(User::factory()->fieldReporter()->create());
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory))->assertForbidden();
        $this->getJson('/api/v1/farmer-broadcasts')->assertForbidden();

        $inspector = User::factory()->fieldReporter()->create(['password' => self::PASSWORD]);
        $this->app['auth']->forgetGuards();
        $token = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $inspector->email, 'password' => self::PASSWORD, 'device_name' => 'Phone', 'device_id' => 'insp-1',
        ])->json('token');
        $this->asToken($token)->getJson('/api/v1/mobile/farmer/advisories')->assertForbidden();
    }

    public function test_a_farmer_chooses_their_own_home_barangay_and_language(): void
    {
        [$farmer, $token] = $this->farmerToken();

        $this->asToken($token)->patchJson('/api/v1/mobile/farmer/profile', ['barangay' => 'Aga', 'preferred_language' => 'en'])
            ->assertOk()->assertJsonPath('data.barangay', 'Aga')->assertJsonPath('data.preferred_language', 'en');
        $this->assertSame('Aga', $farmer->fresh()->barangay);
        $this->asToken($token)->patchJson('/api/v1/mobile/farmer/profile', ['barangay' => null])->assertOk()->assertJsonPath('data.barangay', null);
        $this->asToken($token)->patchJson('/api/v1/mobile/farmer/profile', ['barangay' => 'Atlantis'])->assertUnprocessable();
        $this->asToken($token)->patchJson('/api/v1/mobile/farmer/profile', ['preferred_language' => 'fr'])->assertUnprocessable();
        $this->asToken($token)->patchJson('/api/v1/mobile/farmer/profile', ['role' => 'admin'])->assertUnprocessable();
        $this->assertSame('farmer', $farmer->fresh()->role);
    }

    public function test_the_kill_switch_pauses_broadcasts_without_touching_requests_or_reports(): void
    {
        $this->office();
        $advisory = Advisory::factory()->validated()->create();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory))->assertCreated();
        [, $token] = $this->farmerToken('Aga');
        config(['caneguard.farmer.advisories_enabled' => false]);

        $this->asToken($token)->getJson('/api/v1/mobile/farmer/advisories')->assertStatus(503)->assertJsonPath('code', 'FEATURE_PAUSED');
        $this->asToken($token)->getJson('/api/v1/mobile/farmer/inquiries')->assertOk();
        $this->office();
        $this->getJson('/api/v1/farmer-broadcasts')->assertStatus(503);
    }

    public function test_broadcasting_never_touches_reports(): void
    {
        Report::factory()->count(2)->create();
        $this->office();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload(Advisory::factory()->validated()->create()))->assertCreated();

        $this->assertSame(2, Report::query()->count());
    }
}
