<?php

namespace App\Http\Middleware;

use App\Security\DistrictAccess;
use App\Security\MobileCapabilityRevoked;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureInspectorAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (app(DistrictAccess::class)->inspector($user)) {
            return $next($request);
        }

        if ($user?->isWebUser() === true) {
            abort(403);
        }

        throw new MobileCapabilityRevoked;
    }
}
