<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\RecordSecurityAudit;
use App\Http\Controllers\Controller;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EmailVerificationController extends Controller
{
    public function __invoke(
        Request $request,
        string $id,
        string $hash,
        RecordSecurityAudit $audits,
    ): JsonResponse {
        $user = User::query()->find($id);

        if (! $user || ! hash_equals(
            sha1($user->getEmailForVerification()),
            strtolower($hash),
        )) {
            return response()->json([
                'message' => 'The verification link is invalid or expired.',
                'code' => 'INVALID_VERIFICATION_LINK',
            ], 403);
        }

        $verifiedUser = DB::transaction(function () use ($audits, $user): ?User {
            $lockedUser = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->first();

            if (! $lockedUser || $lockedUser->hasVerifiedEmail() || ! $lockedUser->markEmailAsVerified()) {
                return null;
            }

            $audits->handle(
                SecurityAudit::ACTION_EMAIL_VERIFICATION,
                SecurityAudit::OUTCOME_SUCCESS,
                target: $lockedUser,
            );

            return $lockedUser;
        });

        if ($verifiedUser instanceof User) {
            event(new Verified($verifiedUser));
        }

        return response()->json([
            'message' => 'Email address verified. You may now sign in.',
            'code' => 'EMAIL_VERIFIED',
        ]);
    }
}
