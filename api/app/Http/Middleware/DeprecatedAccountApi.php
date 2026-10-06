<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/** Remove only after the deprecation log shows callers have migrated. */
final class DeprecatedAccountApi
{
    public function handle(Request $request, Closure $next): Response
    {
        // No body, email, password, token, or session contents in caller telemetry.
        Log::notice('Deprecated account API called', [
            'method' => $request->method(), 'route' => $request->route()?->uri(),
            'actor_id' => $request->user()?->id,
        ]);
        $response = $next($request);
        $response->headers->set('Deprecation', 'true');
        $response->headers->set('Link', '</api/v1/admin/accounts>; rel="successor-version"');

        return $response;
    }
}
