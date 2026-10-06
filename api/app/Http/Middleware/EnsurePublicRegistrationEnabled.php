<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsurePublicRegistrationEnabled
{
    public function handle(Request $request, Closure $next): Response
    {
        return response()->json([
            'message' => 'Public self-registration is disabled. Contact your CaneGuard administrator to request an authorized account.',
            'code' => 'REGISTRATION_DISABLED',
        ], 403);
    }
}
