<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\CheckStepUpPassword;
use App\Actions\Auth\RecordSecurityAudit;
use App\Http\Controllers\Controller;
use App\Http\Requests\StaffInvitationRequest;
use App\Models\SecurityAudit;
use App\Models\StaffInvitation;
use App\Models\User;
use App\Notifications\StaffInvitationNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class StaffInvitationController extends Controller
{
    public function __invoke(StaffInvitationRequest $request, CheckStepUpPassword $stepUp, RecordSecurityAudit $audits): JsonResponse
    {
        $actor = $request->user();
        $target = User::query()->where('uuid', $request->validated('user_uuid'))->firstOrFail();
        abort_if($actor->is($target), 403);
        abort_unless(in_array($target->role, User::roles(), true) && $target->hasVerifiedEmail(), 403);
        if (! $stepUp->handle($actor, $request->validated('current_password'), 'staff_invitation', $target)) {
            return response()->json(['message' => 'The current password is incorrect.', 'code' => 'STEP_UP_REQUIRED'], 422);
        }

        $token = bin2hex(random_bytes(32));
        DB::transaction(function () use ($actor, $audits, $request, $target, $token): void {
            $users = User::query()->whereKey([$actor->id, $target->id])
                ->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $actor = $users->get($actor->id);
            $locked = $users->get($target->id);
            abort_unless($actor?->canManageStaff() && $locked?->hasVerifiedEmail()
                && in_array($locked->role, User::roles(), true), 403);
            StaffInvitation::query()->where('user_id', $locked->id)
                ->whereNull('accepted_at')->whereNull('revoked_at')->update(['revoked_at' => now()]);
            $invitation = StaffInvitation::query()->create([
                'user_id' => $locked->id,
                'approved_by' => $actor->id,
                'role' => $request->validated('role'),
                'authority_reference' => trim($request->validated('authority_reference')),
                'email_hash' => hash('sha256', $locked->email),
                'token_hash' => hash('sha256', $token),
                'expires_at' => now()->addHours(config('caneguard.access.invitation_hours')),
            ]);
            $audits->handle('staff_invitation', SecurityAudit::OUTCOME_SUCCESS,
                actor: $actor, target: $locked,
                metadata: ['invitation_id' => $invitation->id, 'role' => $invitation->role, 'authority_reference' => $invitation->authority_reference],
            );
        });
        $target->refresh()->notify(new StaffInvitationNotification($token));

        return response()->json(['message' => 'Approved staff invitation sent.', 'code' => 'STAFF_INVITATION_SENT'], 201);
    }
}
