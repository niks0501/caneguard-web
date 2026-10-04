<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\CertifyStaff;
use App\Http\Controllers\Controller;
use App\Http\Requests\AcceptStaffInvitationRequest;
use App\Models\StaffInvitation;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AcceptStaffInvitationController extends Controller
{
    public function __invoke(AcceptStaffInvitationRequest $request, CertifyStaff $certify): JsonResponse
    {
        $candidate = StaffInvitation::query()->where('token_hash', hash('sha256', $request->validated('token')))->first();
        abort_unless($candidate, 403);
        DB::transaction(function () use ($candidate, $certify, $request): void {
            // All provisioning paths lock users by ID, then the invitation.
            $users = User::query()->whereKey([$candidate->user_id, $candidate->approved_by])
                ->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $target = $users->get($candidate->user_id);
            $actor = $users->get($candidate->approved_by);
            $invitation = StaffInvitation::query()->whereKey($candidate->id)->lockForUpdate()->firstOrFail();
            abort_unless($actor?->canManageStaff()
                && $invitation->accepted_at === null && $invitation->revoked_at === null
                && $invitation->expires_at->isFuture()
                && in_array($target->role, User::roles(), true)
                && in_array($invitation->role, [User::ROLE_FIELD_REPORTER, ...User::officeRoles()], true)
                && $target->hasVerifiedEmail()
                && hash_equals($invitation->email_hash, hash('sha256', $target->email))
                && hash_equals($target->email, Str::lower(trim($request->validated('email'))))
                && Hash::check($request->validated('current_password'), $target->password), 403);

            $invitation->forceFill(['accepted_at' => now()])->save();
            $certify->handle($target, $actor, $invitation->role, $invitation->authority_reference);
        });

        return response()->json(['message' => 'Staff account certified. Sign in again to use your approved access.', 'code' => 'STAFF_CERTIFIED']);
    }
}
