<?php

namespace App\Http\Middleware;

use App\Models\PersonalAccessToken;
use Carbon\CarbonInterface;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureMobileTokenFresh
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->bearerToken() === null) {
            return $next($request);
        }

        $token = $request->user()?->currentAccessToken();

        if (! $token instanceof PersonalAccessToken) {
            return response()->json([
                'message' => 'Unauthenticated.',
                'code' => 'UNAUTHENTICATED',
            ], 401);
        }

        $expiresAt = $token->expires_at;

        // No indefinite Mobile credential is eligible, including legacy tokens.
        if (! $expiresAt instanceof CarbonInterface || $expiresAt->isPast()) {
            return response()->json([
                'message' => 'Unauthenticated.',
                'code' => 'UNAUTHENTICATED',
            ], 401);
        }

        return $next($request);
    }
}
