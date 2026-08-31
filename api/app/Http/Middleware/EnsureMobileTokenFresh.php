<?php

namespace App\Http\Middleware;

use App\Models\PersonalAccessToken;
use Carbon\Carbon;
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
        $createdAt = $token->created_at;

        if (($expiresAt === null || $expiresAt === false) && ! $createdAt instanceof CarbonInterface) {
            $rawCreatedAt = $token->getRawOriginal('created_at');
            $createdAt = is_string($rawCreatedAt) && $rawCreatedAt !== ''
                ? Carbon::parse($rawCreatedAt)
                : null;
        }

        if (($expiresAt === null || $expiresAt === false) && $createdAt instanceof CarbonInterface) {
            $expiresAt = $createdAt->copy()->addMinutes(
                (int) config('caneguard.auth.mobile_token_lifetime_minutes', 10080),
            );
        }

        if (! $expiresAt instanceof CarbonInterface || $expiresAt->isPast()) {
            return response()->json([
                'message' => 'Unauthenticated.',
                'code' => 'UNAUTHENTICATED',
            ], 401);
        }

        return $next($request);
    }
}
