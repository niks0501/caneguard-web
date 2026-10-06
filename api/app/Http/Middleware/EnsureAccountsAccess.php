<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Broad Admin route gate; resource decisions belong to Policies. */
final class EnsureAccountsAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->bearerToken() === null && $request->user()?->isActiveAdmin(), 403);

        return $next($request)->header('Cache-Control', 'private, no-store');
    }
}
