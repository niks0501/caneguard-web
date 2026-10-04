<?php

namespace App\Http\Middleware;

use App\Security\DistrictAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureInspectorAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(app(DistrictAccess::class)->inspector($request->user()), 403);

        return $next($request);
    }
}
