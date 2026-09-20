<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\CheckStepUpPassword;
use App\Actions\Auth\RecordSecurityAudit;
use App\Actions\Auth\RevokeUserAuthentication;
use App\Http\Controllers\Controller;
use App\Http\Requests\ChangeEmailRequest;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class ChangeEmailController extends Controller
{
    public function __invoke(
        ChangeEmailRequest $request,
        CheckStepUpPassword $stepUp,
        RevokeUserAuthentication $revoker,
        RecordSecurityAudit $audits,
    ): JsonResponse {
        $user = $request->user();

        if (! $user instanceof User || ! $stepUp->handle(
            $user,
            $request->validated('current_password'),
            SecurityAudit::ACTION_EMAIL_CHANGE,
        )) {
            return response()->json([
                'message' => 'The current password is incorrect.',
                'code' => 'STEP_UP_REQUIRED',
            ], 422);
        }

        $oldEmail = $user->email;
        DB::transaction(function () use ($audits, $oldEmail, $request, $revoker, $user): void {
            $user->forceFill([
                'email' => $request->validated('email'),
                'email_verified_at' => null,
            ])->save();
            $revoker->handle($user);
            $audits->handle(
                SecurityAudit::ACTION_EMAIL_CHANGE,
                SecurityAudit::OUTCOME_SUCCESS,
                actor: $user,
                target: $user,
                metadata: [
                    'old_email' => $oldEmail,
                    'new_email' => $user->email,
                ],
            );
        });

        $user->sendEmailVerificationNotification();
        $revoker->logoutCurrentWebSession($request, $user);

        return response()->json([
            'message' => 'Email updated. Verify the new address before signing in.',
            'code' => 'EMAIL_VERIFICATION_REQUIRED',
        ], 202);
    }
}
