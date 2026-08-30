<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\CheckStepUpPassword;
use App\Actions\Auth\IssueMobileToken;
use App\Actions\Auth\RecordSecurityAudit;
use App\Http\Controllers\Controller;
use App\Http\Requests\EnrollMobileDeviceRequest;
use App\Http\Requests\MobileLoginRequest;
use App\Http\Requests\MobileSessionRequest;
use App\Http\Resources\AuthenticatedUserResource;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\NewAccessToken;
use Laravel\Sanctum\PersonalAccessToken;

class MobileAuthController extends Controller
{
    public function login(
        MobileLoginRequest $request,
        IssueMobileToken $issueToken,
        RecordSecurityAudit $audits,
    ): JsonResponse {
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

        if (! $user->hasVerifiedEmail()) {
            return response()->json([
                'message' => 'Verify your email address before using Mobile.',
                'code' => 'EMAIL_NOT_VERIFIED',
            ], 403);
        }

        if ($user->role !== User::ROLE_FIELD_REPORTER) {
            return response()->json([
                'message' => 'This account cannot submit mobile field reports.',
                'code' => 'FORBIDDEN',
            ], 403);
        }

        $deviceId = $request->validated('device_id') ?: $request->validated('device_name');
        $token = $issueToken->handle(
            $user,
            $request->validated('device_name'),
            $deviceId,
        );
        $audits->handle(
            SecurityAudit::ACTION_MOBILE_LOGIN,
            SecurityAudit::OUTCOME_SUCCESS,
            actor: $user,
            target: $user,
            metadata: [
                'device_id_hash' => hash('sha256', $deviceId),
            ],
        );

        return $this->tokenResponse($token, $user, $request);
    }

    public function enroll(
        EnrollMobileDeviceRequest $request,
        CheckStepUpPassword $stepUp,
        IssueMobileToken $issueToken,
        RecordSecurityAudit $audits,
    ): JsonResponse {
        $user = $request->user();

        if (! $user instanceof User || ! $stepUp->handle(
            $user,
            $request->validated('current_password'),
            SecurityAudit::ACTION_MOBILE_DEVICE_ENROLLMENT,
        )) {
            return response()->json([
                'message' => 'The current password is incorrect.',
                'code' => 'STEP_UP_REQUIRED',
            ], 422);
        }

        $deviceId = $request->validated('device_id');
        $token = $issueToken->handle(
            $user,
            $request->validated('device_name'),
            $deviceId,
        );
        $audits->handle(
            SecurityAudit::ACTION_MOBILE_DEVICE_ENROLLMENT,
            SecurityAudit::OUTCOME_SUCCESS,
            actor: $user,
            target: $user,
            metadata: [
                'device_id_hash' => hash('sha256', $deviceId),
            ],
        );

        return $this->tokenResponse($token, $user, $request);
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

    private function tokenResponse(
        NewAccessToken $token,
        User $user,
        Request $request,
    ): JsonResponse {
        return response()->json([
            'token' => $token->plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => $token->accessToken->expires_at?->toISOString(),
            'user' => (new AuthenticatedUserResource($user))->resolve($request),
        ]);
    }
}
