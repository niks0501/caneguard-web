<?php

namespace App\Http\Middleware;

use App\Security\DistrictAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureOfficeAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        // Office work is cookie-authenticated Web only, never a Mobile PAT.
        abort_unless($request->bearerToken() === null && app(DistrictAccess::class)->office($request->user()), 403);

        return $next($request);
    }
}
