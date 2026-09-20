<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\CheckStepUpPassword;
use App\Actions\Auth\RecordSecurityAudit;
use App\Actions\Auth\RevokeUserAuthentication;
use App\Http\Controllers\Controller;
use App\Http\Requests\ChangePasswordRequest;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class ChangePasswordController extends Controller
{
    public function __invoke(
        ChangePasswordRequest $request,
        CheckStepUpPassword $stepUp,
        RevokeUserAuthentication $revoker,
        RecordSecurityAudit $audits,
    ): JsonResponse {
        $user = $request->user();

        if (! $user instanceof User || ! $stepUp->handle(
            $user,
            $request->validated('current_password'),
            SecurityAudit::ACTION_PASSWORD_CHANGE,
        )) {
            return response()->json([
                'message' => 'The current password is incorrect.',
                'code' => 'STEP_UP_REQUIRED',
            ], 422);
        }

        DB::transaction(function () use ($audits, $revoker, $request, $user): void {
            $user->forceFill([
                'password' => $request->validated('password'),
            ])->save();
            $revoker->handle($user);
            $audits->handle(
                SecurityAudit::ACTION_PASSWORD_CHANGE,
                SecurityAudit::OUTCOME_SUCCESS,
                actor: $user,
                target: $user,
            );
        });
        $revoker->logoutCurrentWebSession($request, $user);

        return response()->json([
            'message' => 'Password updated. Sign in again with the new password.',
            'code' => 'PASSWORD_CHANGED',
        ]);
    }
}
