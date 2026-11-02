<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\RecordSecurityAudit;
use App\Actions\Auth\ResetPasswordAction;
use App\Actions\Auth\RevokeUserAuthentication;
use App\Http\Controllers\Controller;
use App\Http\Requests\ResetPasswordRequest;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Password;

class ResetPasswordController extends Controller
{
    public function __invoke(
        ResetPasswordRequest $request,
        ResetPasswordAction $resetPassword,
        RevokeUserAuthentication $revoker,
        RecordSecurityAudit $audits,
    ): JsonResponse {
        $resetUser = null;
        $status = $resetPassword->handle(
            $request->validated(),
            function (User $user, string $password) use ($audits, $revoker, &$resetUser): void {
                $newlyVerified = ! $user->hasVerifiedEmail();
                $user->forceFill(['password' => $password]);
                if ($newlyVerified) {
                    // Completing a mailed reset proves control of the address.
                    $user->markEmailAsVerified();
                } else {
                    $user->save();
                }
                $revoker->handle($user);
                $audits->handle(
                    SecurityAudit::ACTION_PASSWORD_RESET,
                    SecurityAudit::OUTCOME_SUCCESS,
                    target: $user,
                );
                if ($newlyVerified) {
                    $audits->handle(SecurityAudit::ACTION_EMAIL_VERIFICATION, SecurityAudit::OUTCOME_SUCCESS, target: $user, metadata: ['via' => 'password_reset']);
                }
                $resetUser = $user;
            },
        );

        if ($status !== Password::PASSWORD_RESET || ! $resetUser instanceof User) {
            return response()->json([
                'message' => 'The password recovery link is invalid or expired.',
                'code' => 'INVALID_RESET_TOKEN',
            ], 422);
        }

        $revoker->logoutCurrentWebSession($request, $resetUser);

        return response()->json([
            'message' => 'Password updated. Sign in with your new password.',
            'code' => 'PASSWORD_RESET',
        ]);
    }
}
