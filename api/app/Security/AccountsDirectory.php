<?php

namespace App\Security;

use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\DistrictMembership;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

final class AccountsDirectory
{
    public function __construct(private DistrictAccess $access) {}

    public function scope(): Builder
    {
        return User::query()->with(['districtMemberships', 'districtGrants', 'accountReview']);
    }

    public function target(string $uuid): User
    {
        return $this->scope()->where('uuid', $uuid)->firstOrFail();
    }

    public function snapshot(User $user, bool $lock = false): array
    {
        $membership = DistrictMembership::query()->where('user_id', $user->id)->where('district_id', $this->access->pilotId())->when($lock, fn ($q) => $q->lockForUpdate())->first();
        $grants = DistrictGrant::query()->where('user_id', $user->id)->where('district_id', $this->access->pilotId())
            ->orderBy('ability')->when($lock, fn ($q) => $q->lockForUpdate())->get(['id', 'ability', 'revision', 'revoked_at'])->map(fn ($g) => [
                'id' => $g->id, 'ability' => $g->ability, 'revision' => $g->revision, 'revoked' => $g->revoked_at !== null,
            ])->all();

        return ['role' => $user->role, 'membership_state' => $membership === null ? 'not_issued' : ($membership->revoked_at === null ? 'active' : 'revoked'),
            'membership_id' => $membership?->id, 'grants' => $grants,
            'review_state' => DB::table('account_reviews')->where('user_id', $user->id)->when($lock, fn ($q) => $q->lockForUpdate())->value('disposition') ?? 'new'];
    }

    public function detail(User $user, ?User $actor): array
    {
        $user->loadMissing(['districtMemberships', 'districtGrants', 'accountReview']);
        $membership = $user->districtMemberships->firstWhere('district_id', $this->access->pilotId());
        $state = $membership === null ? 'not_issued' : ($membership->revoked_at === null ? 'active' : 'revoked');
        $stored = $user->districtGrants->where('district_id', $this->access->pilotId())->whereNull('revoked_at')->pluck('ability')->sort()->values()->all();
        $effective = $state === 'active' && $user->hasVerifiedEmail() && $user->role === User::ROLE_ADMIN ? $stored : [];
        $supported = in_array($user->role, User::roles(), true)
            && in_array($user->registration_origin, ['unknown', 'public_signup', 'office_certified'], true)
            && $user->districtGrants->every(fn ($grant) => in_array($grant->ability, DistrictGrant::ABILITIES, true));
        $eligible = $supported && $user->role === User::ROLE_FARMER && in_array($user->registration_origin, ['public_signup', 'office_certified'], true);
        $actions = [];
        $reasons = [];
        if ($actor?->is($user)) {
            $reasons[] = 'You cannot change your own authority. Use controlled operator handover.';
        } elseif ($user->isWebUser()) {
            $actions = ! $user->is_active ? ['restore'] : ($state === 'not_issued' ? ['admit'] : ['replace', 'revoke']);
            if ($user->is_active && $user->role === User::ROLE_ADMIN) {
                $actions[] = 'transfer';
            }
        } elseif (! $supported || ($state === 'not_issued' && ! $eligible)) {
            $reasons[] = 'Legacy or unsupported identity requires controlled operator reconciliation.';
        } else {
            if ($state === 'not_issued' && $eligible) {
                $actions = ['keep_farmer', 'defer', 'reopen'];
                if ($user->hasVerifiedEmail()) {
                    $actions[] = 'admit';
                }
            } elseif ($state === 'active') {
                $actions = ['revoke'];
                if ($user->hasVerifiedEmail()) {
                    $actions[] = 'replace';
                    if ($user->role === User::ROLE_ADMIN && ! in_array('report:approve', $stored, true)) {
                        $actions[] = 'transfer';
                    }
                }
            } elseif ($state === 'revoked' && $user->hasVerifiedEmail()) {
                $actions = ['restore'];
            }
            if (! $user->hasVerifiedEmail()) {
                $reasons[] = 'Email not verified. Staff issuance is unavailable.';
            }
        }

        return [
            'uuid' => $user->uuid, 'name' => $user->name, 'email' => $user->email,
            'created_at' => $user->created_at->toISOString(), 'origin' => $user->registration_origin,
            'email_verified' => $user->hasVerifiedEmail(), 'role' => $user->role,
            'membership_state' => $state, 'effective_grants' => $effective, 'stored_grants' => $stored,
            'review_state' => $user->accountReview?->disposition ?? 'new',
            'web_access_allowed' => $state === 'active' && $user->hasVerifiedEmail() && $user->isOfficeUser(), 'access_version' => $user->access_version,
            'allowed_actions' => $actions, 'denial_reasons' => $reasons,
            'grant_revisions' => $user->districtGrants->where('district_id', $this->access->pilotId())->map(fn ($g) => [
                'id' => $g->id, 'ability' => $g->ability, 'revision' => $g->revision, 'revoked' => $g->revoked_at !== null,
            ])->values()->all(),
        ];
    }

    public function policy(?User $actor): array
    {
        $district = District::findOrFail($this->access->pilotId());
        $holder = DistrictGrant::query()->where('district_id', $district->id)->where('ability', 'report:approve')->whereNull('revoked_at')->first();
        $user = $holder === null ? null : $this->scope()->find($holder->user_id);

        return ['district' => ['code' => $district->code, 'name' => $district->name], 'one_approver' => true,
            'approver' => $user === null ? null : ['uuid' => $user->uuid, 'name' => $user->name, 'access_version' => $user->access_version],
            'transfer_available' => $user !== null && $user->role === User::ROLE_ADMIN && $this->access->office($user) && ! $actor?->is($user),
            'scope' => 'Configured pilot members and unassigned identities; foreign district identities excluded. Public signups are a single-pilot global inbox.'];
    }
}
