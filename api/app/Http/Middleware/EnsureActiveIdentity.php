<?php

namespace App\Http\Middleware;

use App\Actions\Auth\RevokeUserAuthentication;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

final class EnsureActiveIdentity
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        // Re-read security state in case it changed after the guard loaded the identity.
        $user->refresh();
        if (! $user->is_active) {
            app(RevokeUserAuthentication::class)->logoutCurrentWebSession($request, $user);

            return response()->json(['message' => 'Account disabled — contact your administrator.', 'code' => 'ACCOUNT_DISABLED'], 401);
        }

        // The guard's store also covers array-session tests/non-stateful API requests.
        // Missing versions on pre-release sessions deliberately require a fresh login.
        $guard = Auth::guard('web');
        $session = $request->hasSession() ? $request->session() : app('session.store');
        // Sanctum prefers a cookie identity even when an attacker adds a bearer header.
        if (! ($user->currentAccessToken() instanceof PersonalAccessToken) && $session->has($guard->getName())
            && $session->get('auth.version') !== $user->auth_version) {
            app(RevokeUserAuthentication::class)->logoutCurrentWebSession($request, $user);
            abort(401);
        }
        abort_unless(in_array($user->role, User::roles(), true), 403);

        return $next($request);
    }
}
