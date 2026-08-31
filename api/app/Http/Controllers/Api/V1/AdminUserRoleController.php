<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\CheckStepUpPassword;
use App\Actions\Auth\RecordSecurityAudit;
use App\Actions\Auth\RevokeUserAuthentication;
use App\Http\Controllers\Controller;
use App\Http\Requests\ChangeUserRoleRequest;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class AdminUserRoleController extends Controller
{
    public function __invoke(
        ChangeUserRoleRequest $request,
        User $user,
        CheckStepUpPassword $stepUp,
        RevokeUserAuthentication $revoker,
        RecordSecurityAudit $audits,
    ): JsonResponse {
        $actor = $request->user();

        if (! $actor instanceof User || $actor->is($user)) {
            if ($actor instanceof User) {
                $audits->handle(
                    SecurityAudit::ACTION_ROLE_CHANGE,
                    SecurityAudit::OUTCOME_FAILURE,
                    actor: $actor,
                    target: $user,
                    metadata: ['reason' => 'self_role_change'],
                );
            }

            return response()->json([
                'message' => 'An administrator cannot change their own role.',
                'code' => 'ROLE_CHANGE_FORBIDDEN',
            ], 403);
        }

        if (! $stepUp->handle(
            $actor,
            $request->validated('current_password'),
            SecurityAudit::ACTION_ROLE_CHANGE,
            $user,
        )) {
            return response()->json([
                'message' => 'The current password is incorrect.',
                'code' => 'STEP_UP_REQUIRED',
            ], 422);
        }

        $newRole = $request->validated('role');

        if ($newRole === $user->role) {
            $audits->handle(
                SecurityAudit::ACTION_ROLE_CHANGE,
                SecurityAudit::OUTCOME_FAILURE,
                actor: $actor,
                target: $user,
                metadata: ['reason' => 'role_unchanged'],
            );

            return response()->json([
                'message' => 'The account already has that role.',
                'code' => 'ROLE_UNCHANGED',
            ], 422);
        }

        $oldRole = $user->role;
        DB::transaction(function () use ($audits, $actor, $newRole, $oldRole, $revoker, $user): void {
            $user->forceFill(['role' => $newRole])->save();
            $revoker->handle($user);
            $audits->handle(
                SecurityAudit::ACTION_ROLE_CHANGE,
                SecurityAudit::OUTCOME_SUCCESS,
                actor: $actor,
                target: $user,
                metadata: [
                    'old_role' => $oldRole,
                    'new_role' => $newRole,
                ],
            );
        });

        return response()->json([
            'message' => 'The account role was updated.',
            'code' => 'ROLE_CHANGED',
            'user' => [
                'uuid' => $user->uuid,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ],
        ]);
    }
}
