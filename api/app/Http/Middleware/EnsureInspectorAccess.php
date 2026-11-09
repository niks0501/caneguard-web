<?php

namespace App\Http\Middleware;

use App\Models\PersonalAccessToken;
use App\Security\DistrictAccess;
use App\Security\MobileCapabilityRevoked;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureInspectorAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        if (app(DistrictAccess::class)->inspector($request->user())) {
            return $next($request);
        }

        $token = $request->user()?->currentAccessToken();

        if ($token instanceof PersonalAccessToken && $token->isMobileInspectorSession()) {
            throw new MobileCapabilityRevoked;
        }

        abort(403);
    }
}
