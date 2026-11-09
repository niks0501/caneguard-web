<?php

namespace App\Http\Middleware;

use App\Actions\Auth\IssueMobileToken;
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
        $user = $request->user();

        if (app(DistrictAccess::class)->inspector($user)) {
            return $next($request);
        }

        if ($user?->isWebUser() === true && ! $this->isMobileSession($request)) {
            abort(403);
        }

        throw new MobileCapabilityRevoked;
    }

    private function isMobileSession(Request $request): bool
    {
        $token = $request->user()?->currentAccessToken();

        return $token instanceof PersonalAccessToken
            && str_starts_with($token->name, IssueMobileToken::TOKEN_NAME_PREFIX);
    }
}
