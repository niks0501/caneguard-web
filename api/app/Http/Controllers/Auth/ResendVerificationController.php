<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\RecordSecurityAudit;
use App\Http\Controllers\Controller;
use App\Http\Requests\ResendVerificationRequest;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class ResendVerificationController extends Controller
{
    public function __invoke(
        ResendVerificationRequest $request,
        RecordSecurityAudit $audits,
    ): JsonResponse {
        $user = User::query()
            ->where('email', $request->validated('email'))
            ->first();

        if ($user && ! $user->hasVerifiedEmail()) {
            $user->sendEmailVerificationNotification();
            $audits->handle(
                SecurityAudit::ACTION_VERIFICATION_RESEND,
                SecurityAudit::OUTCOME_SUCCESS,
                target: $user,
            );
        }

        return response()->json([
            'message' => 'If the address is eligible, a verification link will be sent.',
            'code' => 'VERIFICATION_LINK_SENT',
        ], 202);
    }
}
