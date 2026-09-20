<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Report;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

final class MobileMapTileController extends Controller
{
    private const MIN_ZOOM = 11;

    private const MAX_ZOOM = 18;

    private const CACHE_TTL_SECONDS = 86400;

    private const UPSTREAM_BASE_URL = 'https://tile.openstreetmap.org';

    private const UPSTREAM_USER_AGENT = 'CaneGuard-MapTileProxy/1.0';

    public function __invoke(
        Request $request,
        string $z,
        string $x,
        string $y,
    ): Response|JsonResponse {
        abort_unless(
            $request->user()?->can('viewStatuses', Report::class) === true,
            403,
        );

        $coordinates = $this->validCoordinates($z, $x, $y);
        abort_unless($coordinates !== null, 404);

        [$zoom, $column, $row] = $coordinates;
        $cacheKey = sprintf('mobile-map-tile:%d:%d:%d', $zoom, $column, $row);

        try {
            $tile = Cache::remember(
                $cacheKey,
                self::CACHE_TTL_SECONDS,
                fn (): string => $this->fetchTile($zoom, $column, $row),
            );
        } catch (ConnectionException) {
            return $this->upstreamError(504, 'MAP_TILE_UPSTREAM_TIMEOUT');
        } catch (Throwable) {
            return $this->upstreamError(502, 'MAP_TILE_UPSTREAM_UNAVAILABLE');
        }

        return response($tile, 200, [
            'Cache-Control' => 'public, max-age='.self::CACHE_TTL_SECONDS.', immutable',
            'Content-Type' => 'image/png',
        ]);
    }

    /**
     * @return array{0: int, 1: int, 2: int}|null
     */
    private function validCoordinates(string $z, string $x, string $y): ?array
    {
        if (! ctype_digit($z) || ! ctype_digit($x) || ! ctype_digit($y)) {
            return null;
        }

        $zoom = (int) $z;
        $column = (int) $x;
        $row = (int) $y;

        if ($zoom < self::MIN_ZOOM || $zoom > self::MAX_ZOOM) {
            return null;
        }

        $tileCount = 2 ** $zoom;
        if ($column >= $tileCount || $row >= $tileCount) {
            return null;
        }

        return [$zoom, $column, $row];
    }

    private function fetchTile(int $zoom, int $column, int $row): string
    {
        $url = sprintf(
            '%s/%d/%d/%d.png',
            self::UPSTREAM_BASE_URL,
            $zoom,
            $column,
            $row,
        );

        $response = Http::accept('image/png')
            ->withUserAgent(self::UPSTREAM_USER_AGENT)
            ->connectTimeout(2)
            ->timeout(5)
            ->get($url)
            ->throw();

        $body = $response->body();
        if ($body === '') {
            throw new RequestException($response);
        }

        return $body;
    }

    private function upstreamError(int $status, string $code): JsonResponse
    {
        return response()->json([
            'message' => 'The map tile service is temporarily unavailable.',
            'code' => $code,
        ], $status);
    }
}
