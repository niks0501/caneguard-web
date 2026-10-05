<?php

namespace App\Http\Middleware;

use App\Security\DistrictAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureAccountsAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('caneguard.accounts_enabled')) {
            return response()->json(['message' => 'Account management is not enabled.', 'code' => 'ACCOUNTS_UNAVAILABLE'], 503)->header('Cache-Control', 'private, no-store');
        }
        $access = app(DistrictAccess::class);
        if ($access->pilotId() === null) {
            return response()->json(['message' => 'District access is not configured.', 'code' => 'DISTRICT_NOT_CONFIGURED'], 403)->header('Cache-Control', 'private, no-store');
        }
        abort_unless($request->bearerToken() === null && $access->grant($request->user(), 'staff:manage', $access->pilotId()) !== null, 403);

        return $next($request)->header('Cache-Control', 'private, no-store');
    }
}
