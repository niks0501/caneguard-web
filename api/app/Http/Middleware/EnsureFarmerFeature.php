<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Pauses one farmer-facing surface from configuration, without touching inspector or office flows. */
final class EnsureFarmerFeature
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        if (! (bool) config("caneguard.farmer.{$feature}_enabled")) {
            return response()->json([
                'message' => 'This feature is paused. Please try again later.',
                'code' => 'FEATURE_PAUSED',
            ], 503);
        }

        return $next($request);
    }
}
