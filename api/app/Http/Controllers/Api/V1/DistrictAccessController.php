<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\CheckStepUpPassword;
use App\Actions\Auth\ManageAccounts;
use App\Actions\Auth\ReconcileDistrictAccess;
use App\Http\Controllers\Controller;
use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\DistrictMembership;
use App\Models\User;
use App\Security\DistrictAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class DistrictAccessController extends Controller
{
    public function accounts(Request $request, string $uuid, ManageAccounts $accounts): JsonResponse
    {
        return response()->json($accounts->handle($request, 'access', $uuid));
    }

    public function __invoke(Request $request, User $user, DistrictAccess $access, ReconcileDistrictAccess $reconcile, CheckStepUpPassword $stepUp): JsonResponse
    {
        $actor = $request->user();
        abort_unless(! $actor->is($user) && $access->grant($actor, 'staff:manage', $access->pilotId()) !== null
            && in_array($user->role, User::roles(), true), 403);
        // New, unassigned identities require controlled office reconciliation; Web cannot adopt foreign identities.
        abort_unless(DistrictMembership::query()->where('user_id', $user->id)
            ->where('district_id', $access->pilotId())->whereNull('revoked_at')->exists(), 403);
        $input = $request->validate([
            'current_password' => ['required', 'string', 'max:255'],
            'role' => ['required', Rule::in(User::roles())],
            'grants' => ['required', 'array'],
            'grants.*' => [Rule::in(DistrictGrant::ABILITIES), 'distinct'],
            'revoke' => ['required', 'boolean'],
            'office_reference' => ['required', 'string', 'max:160'],
        ]);
        abort_unless($stepUp->handle($actor, $input['current_password'], 'district_access_changed', $user), 403);
        abort_unless(! $input['revoke'] || $input['grants'] === [], 422);
        abort_unless($input['grants'] === [] || ($input['role'] === User::ROLE_ADMIN && $user->hasVerifiedEmail()), 403);
        $event = $reconcile->handle($user, District::findOrFail($access->pilotId()), $input['role'], $input['grants'], $input['revoke'], $input['office_reference'], $actor);

        return response()->json(['message' => $event === null ? 'District access unchanged; prior credentials retained.' : 'District access updated; prior credentials revoked.']);
    }
}
