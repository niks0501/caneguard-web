<?php

namespace App\Http\Middleware;

use App\Actions\Auth\IssueMobileToken;
use App\Models\PersonalAccessToken;
use App\Security\DistrictAccess;
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

        $this->syncAbilities($request, $token);

        return $next($request);
    }

    /**
     * A Mobile token copies its abilities at sign-in, so a role or district
     * change afterwards leaves it stale (an account promoted to inspector keeps
     * 'account:security' only; an older token may lack newer capabilities).
     * Refresh them for a current inspector before the ability gates run. Never
     * narrow: a demoted inspector keeps the token so inspector.access can answer
     * CAPABILITY_REVOKED instead of a bare 403.
     */
    private function syncAbilities(Request $request, PersonalAccessToken $token): void
    {
        $user = $request->user();

        if ($user === null
            || ! is_string($token->name)
            || ! str_starts_with($token->name, IssueMobileToken::TOKEN_NAME_PREFIX)) {
            return;
        }

        $current = DistrictAccess::MOBILE_CAPABILITIES;
        $stored = (array) $token->abilities;

        if (array_diff($current, $stored) === [] && array_diff($stored, $current) === []) {
            return;
        }

        $fresh = $user->fresh();

        if ($fresh === null || ! app(DistrictAccess::class)->inspector($fresh)) {
            return;
        }

        $token->forceFill(['abilities' => $current])->save();
    }
}
