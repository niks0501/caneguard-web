<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
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
                'immutable, max-age=86400, public',
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

    private function fieldReporterToken(): string
    {
        return User::factory()->inDistrict($this->pilotDistrict())
            ->fieldReporter()
            ->create()
            ->createToken('map-tile-test')
            ->plainTextToken;
    }
}
