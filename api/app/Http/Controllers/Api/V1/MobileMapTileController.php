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

    /** OpenStreetMap tile usage policy: minimum freshness when upstream headers are unusable. */
    private const FALLBACK_FRESHNESS_SECONDS = 604800;

    /** Upstream freshness is honoured but never kept fresh longer than this. */
    private const MAX_FRESHNESS_SECONDS = 2592000;

    /** Even `no-cache` upstream is rechecked at most once a minute per tile, so clients cannot hammer it. */
    private const MIN_RECHECK_SECONDS = 60;

    /** Expired tiles stay stored this long so an upstream outage can still be answered. */
    private const RETENTION_SECONDS = 2592000;

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
        $cacheKey = sprintf('mobile-map-tile:v2:%d:%d:%d', $zoom, $column, $row);
        $now = now()->getTimestamp();

        /** @var array{body: string, expires_at: int, upstream_etag: ?string}|null $entry */
        $entry = Cache::get($cacheKey);
        $stale = false;

        if ($entry === null || $entry['expires_at'] <= $now) {
            try {
                $entry = $this->refresh($cacheKey, $zoom, $column, $row, $entry, $now);
            } catch (Throwable $exception) {
                if ($entry === null) {
                    return $exception instanceof ConnectionException
                        ? $this->upstreamError(504, 'MAP_TILE_UPSTREAM_TIMEOUT')
                        : $this->upstreamError(502, 'MAP_TILE_UPSTREAM_UNAVAILABLE');
                }
                // Upstream is down: answer with the expired copy rather than failing the map.
                $stale = true;
            }
        }

        $etag = '"'.md5($entry['body']).'"';
        $headers = [
            'Cache-Control' => $this->cacheControl($entry, $stale, $now),
            'ETag' => $etag,
        ];

        if (in_array($etag, $this->requestEtags($request), true)) {
            return response('', 304, $headers);
        }

        return response($entry['body'], 200, $headers + ['Content-Type' => 'image/png']);
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

    /**
     * Fetches (or revalidates) the tile and stores it for as long as the
     * upstream headers allow, falling back to seven days when they say nothing.
     *
     * @param  array{body: string, expires_at: int, upstream_etag: ?string}|null  $previous
     * @return array{body: string, expires_at: int, upstream_etag: ?string}
     */
    private function refresh(
        string $cacheKey,
        int $zoom,
        int $column,
        int $row,
        ?array $previous,
        int $now,
    ): array {
        $url = sprintf(
            '%s/%d/%d/%d.png',
            self::UPSTREAM_BASE_URL,
            $zoom,
            $column,
            $row,
        );

        $request = Http::accept('image/png')
            ->withUserAgent(self::UPSTREAM_USER_AGENT)
            ->connectTimeout(2)
            ->timeout(5);
        if ($previous !== null && $previous['upstream_etag'] !== null) {
            $request = $request->withHeaders(['If-None-Match' => $previous['upstream_etag']]);
        }

        $response = $request->get($url);

        if ($response->status() === 304 && $previous !== null) {
            $freshness = $this->freshness($response->header('Cache-Control'), $response->header('Expires'), $response->header('Age'), $now);
            $entry = $previous;
            $entry['expires_at'] = $now + ($freshness ?? self::MIN_RECHECK_SECONDS);
            Cache::put($cacheKey, $entry, self::RETENTION_SECONDS);

            return $entry;
        }

        $response->throw();

        $body = $response->body();
        // An empty body or an HTML error page served as 200 must never be cached as a tile.
        if (! str_starts_with($body, "\x89PNG\r\n\x1a\n")) {
            throw new RequestException($response);
        }

        $freshness = $this->freshness($response->header('Cache-Control'), $response->header('Expires'), $response->header('Age'), $now);
        $etag = $response->header('ETag');
        $entry = [
            'body' => $body,
            'expires_at' => $now + ($freshness ?? self::MIN_RECHECK_SECONDS),
            'upstream_etag' => $etag !== '' && strlen($etag) <= 200 ? $etag : null,
        ];

        // `no-store` upstream: serve this response but keep nothing.
        if ($freshness !== null) {
            Cache::put($cacheKey, $entry, self::RETENTION_SECONDS);
        }

        return $entry;
    }

    /**
     * Seconds the tile may be reused, or null when upstream forbids storing it.
     */
    private function freshness(string $cacheControl, string $expires, string $age, int $now): ?int
    {
        $directives = array_map('trim', explode(',', strtolower($cacheControl)));

        if (in_array('no-store', $directives, true)) {
            return null;
        }
        if (in_array('no-cache', $directives, true)) {
            return self::MIN_RECHECK_SECONDS;
        }

        $seconds = self::FALLBACK_FRESHNESS_SECONDS;
        $maxAge = null;
        foreach ($directives as $directive) {
            if (preg_match('/^max-age=(\d+)$/', $directive, $match) === 1) {
                $maxAge = (int) $match[1];
            }
        }

        if ($maxAge !== null) {
            $seconds = $maxAge;
            if (ctype_digit($age)) {
                $seconds -= (int) $age;
            }
        } elseif (($expiresAt = strtotime($expires)) !== false && $expires !== '') {
            $seconds = $expiresAt - $now;
        }

        return max(self::MIN_RECHECK_SECONDS, min($seconds, self::MAX_FRESHNESS_SECONDS));
    }

    /**
     * @param  array{body: string, expires_at: int, upstream_etag: ?string}  $entry
     */
    private function cacheControl(array $entry, bool $stale, int $now): string
    {
        if ($stale) {
            return 'public, max-age=0';
        }

        $remaining = max(0, $entry['expires_at'] - $now);

        // Clients may reuse the tile only for as long as upstream allowed.
        return 'public, max-age='.$remaining;
    }

    /**
     * @return list<string>
     */
    private function requestEtags(Request $request): array
    {
        $header = $request->header('If-None-Match', '');

        return array_map(
            static fn (string $etag): string => trim(preg_replace('/^W\//', '', trim($etag)) ?? ''),
            explode(',', is_string($header) ? $header : ''),
        );
    }

    private function upstreamError(int $status, string $code): JsonResponse
    {
        return response()->json([
            'message' => 'The map tile service is temporarily unavailable.',
            'code' => $code,
        ], $status);
    }
}
