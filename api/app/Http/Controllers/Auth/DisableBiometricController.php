<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\CheckStepUpPassword;
use App\Actions\Auth\RecordSecurityAudit;
use App\Actions\Auth\RevokeUserAuthentication;
use App\Http\Controllers\Controller;
use App\Http\Requests\DisableBiometricRequest;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class DisableBiometricController extends Controller
{
    public function __invoke(
        DisableBiometricRequest $request,
        CheckStepUpPassword $stepUp,
        RevokeUserAuthentication $revoker,
        RecordSecurityAudit $audits,
    ): JsonResponse {
        $user = $request->user();

        if (! $user instanceof User || ! $stepUp->handle(
            $user,
            $request->validated('current_password'),
            SecurityAudit::ACTION_BIOMETRIC_DISABLEMENT,
        )) {
            return response()->json([
                'message' => 'The current password is incorrect.',
                'code' => 'STEP_UP_REQUIRED',
            ], 422);
        }

        DB::transaction(function () use ($audits, $revoker, $user): void {
            $user->forceFill(['biometric_enabled' => false])->save();
            $revoker->handle($user);
            $audits->handle(
                SecurityAudit::ACTION_BIOMETRIC_DISABLEMENT,
                SecurityAudit::OUTCOME_SUCCESS,
                actor: $user,
                target: $user,
            );
        });
        $revoker->logoutCurrentWebSession($request, $user);

        return response()->json([
            'message' => 'Biometric sign-in is disabled. Sign in with your password to continue.',
            'code' => 'BIOMETRIC_DISABLED',
        ]);
    }
}
