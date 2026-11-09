<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Security\DistrictAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureMobileCapability
{
    public function handle(Request $request, Closure $next, string $ability): Response
    {
        $user = $request->user();
        if (! $user instanceof User) {
            abort(403);
        }

        app(DistrictAccess::class)->requireMobileCapability($user, $ability);

        return $next($request);
    }
}
