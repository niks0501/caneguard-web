<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\MobileLoginRequest;
use App\Http\Requests\MobileSessionRequest;
use App\Http\Resources\AuthenticatedUserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\NewAccessToken;
use Laravel\Sanctum\PersonalAccessToken;

class MobileAuthController extends Controller
{
    private const TOKEN_ABILITIES = [
        'report:submit',
        'report:status',
    ];

    private const TOKEN_NAME_PREFIX = 'caneguard-mobile:';

    public function login(MobileLoginRequest $request): JsonResponse
    {
        $credentials = $request->safe()->only(['email', 'password']);

        if (! Auth::guard('web')->validate($credentials)) {
            return response()->json([
                'message' => 'The provided credentials are invalid.',
                'code' => 'INVALID_CREDENTIALS',
                'errors' => [
                    'email' => ['The provided credentials are invalid.'],
                ],
            ], 422);
        }

        $user = User::query()
            ->where('email', $credentials['email'])
            ->first();

        if (! $user) {
            return response()->json([
                'message' => 'The provided credentials are invalid.',
                'code' => 'INVALID_CREDENTIALS',
                'errors' => [
                    'email' => ['The provided credentials are invalid.'],
                ],
            ], 422);
        }

        if ($user->role !== User::ROLE_FIELD_REPORTER) {
            return response()->json([
                'message' => 'This account cannot submit mobile field reports.',
                'code' => 'FORBIDDEN',
            ], 403);
        }

        $tokenName = self::TOKEN_NAME_PREFIX.$request->string('device_name');
        $token = DB::transaction(
            function () use ($tokenName, $user): NewAccessToken {
                $user->tokens()->where('name', $tokenName)->delete();

                return $user->createToken(
                    $tokenName,
                    self::TOKEN_ABILITIES,
                );
            },
        );

        return response()->json([
            'token' => $token->plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => $token->accessToken->expires_at?->toISOString(),
            'user' => (new AuthenticatedUserResource($user))->resolve($request),
        ]);
    }

    public function me(MobileSessionRequest $request): JsonResponse
    {
        return response()->json([
            'user' => (new AuthenticatedUserResource(
                $request->user(),
            ))->resolve($request),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();

        if (! $token instanceof PersonalAccessToken) {
            return response()->json([
                'message' => 'Unauthenticated.',
                'code' => 'UNAUTHENTICATED',
            ], 401);
        }

        $token->delete();

        return response()->json([], 204);
    }
}
