<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Security\DistrictAccess;
use App\Security\MobileCapabilityRevoked;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureInspectorAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! app(DistrictAccess::class)->inspector($request->user())) {
            if ($request->user()?->role === User::ROLE_FIELD_REPORTER && $this->isMobileRecordWrite($request)) {
                throw new MobileCapabilityRevoked($this->capabilityFor($request));
            }

            abort(403);
        }

        return $next($request);
    }

    private function isMobileRecordWrite(Request $request): bool
    {
        return in_array($request->path(), [
            'api/v1/mobile/field-surveys',
            'api/v1/mobile/reports',
            'api/v2/mobile/reports',
            'api/v3/mobile/reports',
        ], true) || preg_match('#^api/v1/mobile/assignments/[^/]+/completion$#D', $request->path()) === 1;
    }

    private function capabilityFor(Request $request): string
    {
        return $request->is('api/v1/mobile/assignments/*/completion')
            ? 'assignment:complete'
            : 'report:submit';
    }
}
