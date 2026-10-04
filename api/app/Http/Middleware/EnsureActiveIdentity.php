<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureActiveIdentity
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user() instanceof User && in_array($request->user()->role, User::roles(), true), 403);

        return $next($request);
    }
}
