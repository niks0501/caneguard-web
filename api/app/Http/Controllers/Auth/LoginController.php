<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class LoginController extends Controller
{
    public function __invoke(LoginRequest $request): JsonResponse
    {
        if (! Auth::guard('web')->attempt($request->safe()->only(['email', 'password']))) {
            return response()->json([
                'message' => 'The provided credentials are invalid.',
                'code' => 'INVALID_CREDENTIALS',
                'errors' => [
                    'email' => ['The provided credentials are invalid.'],
                ],
            ], 422);
        }

        $request->session()->regenerate();
        $user = Auth::guard('web')->user();

        if (! $user?->is_active) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'message' => 'Account disabled — contact your administrator.',
                'code' => 'ACCOUNT_DISABLED',
            ], 403);
        }

        if (! $user?->hasVerifiedEmail()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'message' => 'Verify your email address before signing in.',
                'code' => 'EMAIL_NOT_VERIFIED',
            ], 403);
        }

        if (! $user->isWebUser()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'message' => 'This account cannot access the web workspace.',
                'code' => 'FORBIDDEN',
            ], 403);
        }

        $request->session()->put('auth.version', $user->auth_version);

        return response()->json([], 204);
    }
}
