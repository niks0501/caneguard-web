<?php

namespace Tests\Feature;

use App\Models\Advisory;
use App\Models\FarmerAdvisoryBroadcast;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class FarmerBroadcastTest extends TestCase
{
    use RefreshDatabase;

    /** Generated per run, so no credential-looking literal lives in the repository. */
    private string $password;

    protected function setUp(): void
    {
        parent::setUp();
        $this->password = 'farm-'.Str::random(24);
    }

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
        $farmer = User::factory()->farmer()->create(['password' => $this->password, 'barangay' => $barangay]);
        $this->app['auth']->forgetGuards();
        $token = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $farmer->email, 'password' => $this->password, 'device_name' => 'Phone', 'device_id' => 'phone-'.$farmer->id,
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

    public function test_archiving_an_advisory_keeps_its_broadcast_readable_to_the_office_and_off_the_phone(): void
    {
        $this->office();
        $advisory = Advisory::factory()->validated()->create();
        $uuid = $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory))->assertCreated()->json('data.uuid');
        [, $aga] = $this->farmerToken('Aga');
        $this->office();

        // The restrictOnDelete key never fires: a referenced advisory is archived, not removed.
        $this->deleteJson("/api/v1/advisories/{$advisory->uuid}")
            ->assertOk()
            ->assertExactJson(['data' => ['uuid' => $advisory->uuid, 'deleted' => 'archived']]);
        $this->assertSoftDeleted('advisories', ['id' => $advisory->getKey()]);
        $this->assertSame(1, FarmerAdvisoryBroadcast::query()->count());

        $this->getJson('/api/v1/farmer-broadcasts')->assertOk()
            ->assertJsonPath('data.0.uuid', $uuid)
            ->assertJsonPath('data.0.advisory.uuid', $advisory->uuid)
            ->assertJsonPath('data.0.advisory.title', $advisory->title)
            ->assertJsonPath('data.0.live', false);
        $this->postJson("/api/v1/farmer-broadcasts/{$uuid}/retire")->assertOk()->assertJsonPath('data.advisory.code', $advisory->code);
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory))
            ->assertUnprocessable()->assertJsonPath('errors.advisory_uuid.0', Advisory::REMOVED_FROM_LIBRARY_MESSAGE);

        $this->assertSame([], $this->asToken($aga)->getJson('/api/v1/mobile/farmer/advisories')->assertOk()->json('data'));
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

        $inspector = User::factory()->fieldReporter()->create(['password' => $this->password]);
        $this->app['auth']->forgetGuards();
        $token = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $inspector->email, 'password' => $this->password, 'device_name' => 'Phone', 'device_id' => 'insp-1',
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

    public function test_the_kill_switch_pauses_broadcasts(): void
    {
        $this->office();
        $advisory = Advisory::factory()->validated()->create();
        $this->postJson('/api/v1/farmer-broadcasts', $this->payload($advisory))->assertCreated();
        [, $token] = $this->farmerToken('Aga');
        config(['caneguard.farmer.advisories_enabled' => false]);

        $this->asToken($token)->getJson('/api/v1/mobile/farmer/advisories')->assertStatus(503)->assertJsonPath('code', 'FEATURE_PAUSED');
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

    public function test_a_farmer_still_receives_older_matching_broadcasts_when_more_than_fifty_live_broadcasts_exist(): void
    {
        $publisher = $this->office();
        $advisory = Advisory::factory()->validated()->create();

        FarmerAdvisoryBroadcast::query()->create([
            'advisory_id' => $advisory->id,
            'headline_tl' => 'Lumang paalala sa Aga',
            'headline_en' => 'Older Aga alert',
            'body_tl' => 'Tingnan ang mga punla sa Aga.',
            'body_en' => 'Inspect shoots in Aga.',
            'barangays' => ['Aga'],
            'published_by_id' => $publisher->id,
            'published_at' => now()->subHours(3),
            'expires_at' => now()->addDays(14),
        ]);

        FarmerAdvisoryBroadcast::query()->create([
            'advisory_id' => $advisory->id,
            'headline_tl' => 'Para sa lahat',
            'headline_en' => 'Older all-barangay alert',
            'body_tl' => 'Abiso sa buong bayan.',
            'body_en' => 'Town-wide notice.',
            'barangays' => null,
            'published_by_id' => $publisher->id,
            'published_at' => now()->subHours(2),
            'expires_at' => now()->addDays(14),
        ]);

        for ($index = 0; $index < 55; $index++) {
            FarmerAdvisoryBroadcast::query()->create([
                'advisory_id' => $advisory->id,
                'headline_tl' => "Paalala sa Tumalim {$index}",
                'headline_en' => "Tumalim alert {$index}",
                'body_tl' => 'Abiso para sa Tumalim lamang.',
                'body_en' => 'Notice for Tumalim only.',
                'barangays' => ['Tumalim'],
                'published_by_id' => $publisher->id,
                'published_at' => now()->subMinutes(55 - $index),
                'expires_at' => now()->addDays(14),
            ]);
        }

        [, $agaToken] = $this->farmerToken('Aga');
        $agaHeadlines = collect(
            $this->asToken($agaToken)->getJson('/api/v1/mobile/farmer/advisories')->assertOk()->json('data'),
        )->pluck('headline_en')->all();
        $this->assertSame(['Older all-barangay alert', 'Older Aga alert'], $agaHeadlines);

        [, $noneToken] = $this->farmerToken();
        $noneHeadlines = collect(
            $this->asToken($noneToken)->getJson('/api/v1/mobile/farmer/advisories')->assertOk()->json('data'),
        )->pluck('headline_en')->all();
        $this->assertSame(['Older all-barangay alert'], $noneHeadlines);

        [, $tumalimToken] = $this->farmerToken('Tumalim');
        $tumalimData = $this->asToken($tumalimToken)->getJson('/api/v1/mobile/farmer/advisories')->assertOk()->json('data');
        $this->assertCount(50, $tumalimData);
    }

    public function test_pivot_migration_backfills_existing_json_barangays(): void
    {
        $publisher = $this->office();
        $advisory = Advisory::factory()->validated()->create();

        $broadcastId = DB::table('farmer_advisory_broadcasts')->insertGetId([
            'uuid' => (string) Str::uuid(),
            'advisory_id' => $advisory->id,
            'headline_tl' => 'Backfill TL',
            'headline_en' => 'Backfill EN',
            'body_tl' => 'Nilalaman',
            'body_en' => 'Content',
            'barangays' => json_encode(['Aga', 'Banilad'], JSON_THROW_ON_ERROR),
            'published_by_id' => $publisher->id,
            'published_at' => now()->format('Y-m-d H:i:s.v'),
            'expires_at' => now()->addDays(7)->format('Y-m-d H:i:s.v'),
            'created_at' => now()->format('Y-m-d H:i:s.v'),
            'updated_at' => now()->format('Y-m-d H:i:s.v'),
        ]);

        $this->assertDatabaseMissing('farmer_advisory_broadcast_barangays', ['broadcast_id' => $broadcastId]);

        $migration = require database_path('migrations/2026_11_29_000300_create_farmer_advisory_broadcast_barangays_table.php');
        $migration->up();

        $this->assertDatabaseHas('farmer_advisory_broadcast_barangays', [
            'broadcast_id' => $broadcastId,
            'barangay' => 'Aga',
        ]);
        $this->assertDatabaseHas('farmer_advisory_broadcast_barangays', [
            'broadcast_id' => $broadcastId,
            'barangay' => 'Banilad',
        ]);
        $this->assertSame(
            [$broadcastId],
            FarmerAdvisoryBroadcast::query()->forBarangay('Aga')->pluck('id')->all(),
        );
    }

    public function test_office_index_returns_verified_farmer_reach_summary_metadata(): void
    {
        $this->office();

        $emptyResponse = $this->getJson('/api/v1/farmer-broadcasts')->assertOk();
        $emptyResponse->assertJsonPath('meta.total_verified_farmers', 0);
        $this->assertStringContainsString('"barangay_counts":{}', $emptyResponse->getContent());

        User::factory()->farmer()->create(['barangay' => 'Aga']);
        User::factory()->farmer()->create(['barangay' => 'Aga']);
        User::factory()->farmer()->create(['barangay' => 'Banilad']);
        User::factory()->farmer()->create(['barangay' => null]);
        User::factory()->farmer()->create(['barangay' => 'Aga', 'is_active' => false]);
        User::factory()->farmer()->unverified()->create(['barangay' => 'Aga']);
        User::factory()->fieldReporter()->create(['barangay' => 'Aga']);

        $this->getJson('/api/v1/farmer-broadcasts')
            ->assertOk()
            ->assertJsonPath('meta.total_verified_farmers', 4)
            ->assertJsonPath('meta.barangay_counts', [
                'Aga' => 2,
                'Banilad' => 1,
            ]);
    }
}
