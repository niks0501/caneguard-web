<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MobileMapTileTest extends TestCase
{
    use RefreshDatabase;

    public function test_tile_route_requires_a_field_reporter_read_session(): void
    {
        $this->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $token = $reviewer->createToken('map-tile-reviewer-test')->plainTextToken;

        $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_tile_is_fetched_as_png_and_cached_after_a_successful_upstream_response(): void
    {
        $png = "\x89PNG\r\n\x1a\nfixture";
        Http::fake([
            'https://tile.openstreetmap.org/*' => Http::response($png, 200, [
                'Content-Type' => 'image/png',
            ]),
        ]);
        $token = $this->fieldReporterToken();

        $first = $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png')
            ->assertHeader(
                'Cache-Control',
                'max-age=604800, public',
            );
        $this->assertSame($png, $first->getContent());

        $second = $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertOk();
        $this->assertSame($png, $second->getContent());

        Http::assertSentCount(1);
        Http::assertSent(function ($request): bool {
            return $request->url() === 'https://tile.openstreetmap.org/15/100/100.png'
                && $request->header('User-Agent') === ['CaneGuard-MapTileProxy/1.0']
                && $request->header('Accept') === ['image/png'];
        });
    }

    public function test_tile_coordinates_outside_the_supported_range_are_not_forwarded(): void
    {
        Http::fake();
        $token = $this->fieldReporterToken();

        $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/10/100/100.png')
            ->assertNotFound()
            ->assertJsonPath('code', 'NOT_FOUND');

        $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/32768/100.png')
            ->assertNotFound()
            ->assertJsonPath('code', 'NOT_FOUND');

        $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/32768.png')
            ->assertNotFound()
            ->assertJsonPath('code', 'NOT_FOUND');

        Http::assertNothingSent();
    }

    public function test_upstream_http_failure_returns_a_generic_bad_gateway_response(): void
    {
        Http::fake([
            'https://tile.openstreetmap.org/*' => Http::response(
                'upstream internal details',
                503,
            ),
        ]);
        $token = $this->fieldReporterToken();

        $response = $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertStatus(502)
            ->assertJsonPath('code', 'MAP_TILE_UPSTREAM_UNAVAILABLE');

        $this->assertStringNotContainsString(
            'upstream internal details',
            $response->getContent(),
        );
        $this->assertStringNotContainsString(
            'tile.openstreetmap.org',
            $response->getContent(),
        );
    }

    public function test_upstream_connection_failure_returns_gateway_timeout(): void
    {
        Http::fake([
            'https://tile.openstreetmap.org/*' => fn () => throw new ConnectionException(
                'upstream connection details',
            ),
        ]);
        $token = $this->fieldReporterToken();

        $response = $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertStatus(504)
            ->assertJsonPath('code', 'MAP_TILE_UPSTREAM_TIMEOUT');

        $this->assertStringNotContainsString(
            'upstream connection details',
            $response->getContent(),
        );
    }

    public function test_upstream_freshness_headers_set_how_long_the_tile_is_cached(): void
    {
        Carbon::setTestNow('2026-11-22 08:00:00');
        $png = "\x89PNG\r\n\x1a\nfixture";
        Http::fake([
            'https://tile.openstreetmap.org/*' => Http::response($png, 200, [
                'Cache-Control' => 'public, max-age=3600',
                'Age' => '600',
            ]),
        ]);
        $token = $this->fieldReporterToken();

        $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=3000, public');

        Carbon::setTestNow('2026-11-22 08:10:00');
        $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=2400, public');
        Http::assertSentCount(1);
    }

    public function test_expired_tiles_are_revalidated_upstream_and_renewed_on_304(): void
    {
        Carbon::setTestNow('2026-11-22 08:00:00');
        $png = "\x89PNG\r\n\x1a\nfixture";
        Http::fake([
            'https://tile.openstreetmap.org/*' => Http::sequence()
                ->push($png, 200, ['Cache-Control' => 'max-age=3600', 'ETag' => '"up1"'])
                ->push('', 304, ['Cache-Control' => 'max-age=3600']),
        ]);
        $token = $this->fieldReporterToken();

        $this->withToken($token)->get('/api/v1/mobile/map-tiles/15/100/100.png')->assertOk();

        Carbon::setTestNow('2026-11-22 09:30:00');
        $response = $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=3600, public');
        $this->assertSame($png, $response->getContent());

        Http::assertSentCount(2);
        Http::assertSent(fn ($request): bool => $request->header('If-None-Match') === ['"up1"']);
    }

    public function test_expired_tile_is_served_when_the_upstream_is_down(): void
    {
        Carbon::setTestNow('2026-11-22 08:00:00');
        $png = "\x89PNG\r\n\x1a\nfixture";
        Http::fake([
            'https://tile.openstreetmap.org/*' => Http::sequence()
                ->push($png, 200, ['Cache-Control' => 'max-age=3600'])
                ->push('down', 503),
        ]);
        $token = $this->fieldReporterToken();

        $this->withToken($token)->get('/api/v1/mobile/map-tiles/15/100/100.png')->assertOk();

        Carbon::setTestNow('2026-11-22 10:00:00');
        $response = $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=0, public');
        $this->assertSame($png, $response->getContent());
    }

    public function test_no_store_tiles_and_non_png_bodies_are_never_cached(): void
    {
        $png = "\x89PNG\r\n\x1a\nfixture";
        Http::fake([
            'https://tile.openstreetmap.org/*' => Http::sequence()
                ->push($png, 200, ['Cache-Control' => 'no-store'])
                ->push('<html>blocked</html>', 200),
        ]);
        $token = $this->fieldReporterToken();

        $this->withToken($token)->get('/api/v1/mobile/map-tiles/15/100/100.png')->assertOk();
        $this->assertNull(Cache::get('mobile-map-tile:v2:15:100:100'));

        $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertStatus(502);
        $this->assertNull(Cache::get('mobile-map-tile:v2:15:100:100'));
    }

    public function test_matching_if_none_match_returns_304_without_a_body(): void
    {
        $png = "\x89PNG\r\n\x1a\nfixture";
        Http::fake(['https://tile.openstreetmap.org/*' => Http::response($png, 200)]);
        $token = $this->fieldReporterToken();

        $etag = $this->withToken($token)
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertOk()
            ->headers->get('ETag');

        $this->withToken($token)
            ->withHeaders(['If-None-Match' => $etag])
            ->get('/api/v1/mobile/map-tiles/15/100/100.png')
            ->assertStatus(304);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function fieldReporterToken(): string
    {
        return User::factory()->inDistrict($this->pilotDistrict())
            ->fieldReporter()
            ->create()
            ->createToken('map-tile-test')
            ->plainTextToken;
    }
}
