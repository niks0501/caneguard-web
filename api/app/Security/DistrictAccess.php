<?php

namespace App\Security;

use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\DistrictMembership;
use App\Models\Report;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

final class DistrictAccess
{
    public function pilotId(): ?int
    {
        $code = trim((string) config('caneguard.pilot_district_code'));

        return $code === '' ? null : District::query()->where('code', $code)->value('id');
    }

    public function allows(?User $user, ?int $districtId): bool
    {
        return $user !== null && $user->hasVerifiedEmail()
            && in_array($user->role, [User::ROLE_FIELD_REPORTER, ...User::officeRoles()], true)
            && $districtId !== null && $districtId === $this->pilotId()
            && DistrictMembership::query()->where('user_id', $user->getKey())
                ->where('district_id', $districtId)->whereNull('revoked_at')->exists();
    }

    public function office(?User $user): bool
    {
        return $user?->isOfficeUser() === true && $this->allows($user, $this->pilotId());
    }

    public function inspector(?User $user): bool
    {
        return $user?->role === User::ROLE_FIELD_REPORTER && $this->allows($user, $this->pilotId());
    }

    public function grant(?User $user, string $ability, ?int $districtId): ?DistrictGrant
    {
        if ($user?->role !== User::ROLE_ADMIN || ! $this->allows($user, $districtId)
            || ! in_array($ability, DistrictGrant::ABILITIES, true)) {
            return null;
        }

        return DistrictGrant::query()->where('user_id', $user->getKey())
            ->where('district_id', $districtId)->where('ability', $ability)
            ->whereNull('revoked_at')->first();
    }

    /** Shared district ceiling; personal report reads further require ownership. */
    public function scope(Builder $query, ?User $user, bool $ownerOnly = true): Builder
    {
        if (! $this->allows($user, $this->pilotId())) {
            return $query->whereRaw('1 = 0');
        }

        $query->where($query->getModel()->qualifyColumn('district_id'), $this->pilotId());
        if ($ownerOnly && $user->role === User::ROLE_FIELD_REPORTER) {
            $query->where($query->getModel()->qualifyColumn('reporter_id'), $user->getKey());
        }

        return $query;
    }

    public function report(?User $user, Report $report, bool $assigned = false): bool
    {
        return $this->allows($user, $report->district_id)
            && ($user->isOfficeUser() || ($user->role === User::ROLE_FIELD_REPORTER
                && ((int) $report->reporter_id === (int) $user->getKey()
                    || ($assigned && $report->fieldValidationAssignment?->assignee_id === $user->getKey()))));
    }

    public function capabilities(User $user): array
    {
        $capabilities = $this->inspector($user)
            ? ['report:submit', 'report:status', 'assignment:read', 'assignment:complete', 'notification:read']
            : ($this->office($user) ? ['case:review'] : []);

        foreach (DistrictGrant::ABILITIES as $ability) {
            if ($this->grant($user, $ability, $this->pilotId()) !== null) {
                $capabilities[] = $ability;
            }
        }

        return $capabilities;
    }
}
