<?php

namespace App\Policies;

use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;

class ReportPolicy
{
    public function before(User $user, string $ability): ?bool
    {
        if (
            $user->isOfficeUser()
            && in_array($ability, ['viewAny', 'view', 'review', 'linkDuplicate'], true)
        ) {
            return true;
        }

        return null;
    }

    public function viewAny(User $user): bool
    {
        return $user->isOfficeUser();
    }

    public function view(User $user, Report $report): bool
    {
        if ($user->isOfficeUser()) {
            return true;
        }

        return $this->hasAssignedConsult($user, $report);
    }

    public function viewPossibleMatches(User $user, Report $report): bool
    {
        return $user->isOfficeUser();
    }

    public function viewExpertQueue(User $user): bool
    {
        return $user->isExpert();
    }

    public function create(User $user): bool
    {
        return $user->role === User::ROLE_FIELD_REPORTER;
    }

    public function viewStatuses(User $user): bool
    {
        return $user->role === User::ROLE_FIELD_REPORTER;
    }

    public function review(User $user, Report $report): bool
    {
        return $user->isOfficeUser();
    }

    public function respondToReferral(User $user, Report $report): bool
    {
        if ($user->isOfficeUser()) {
            return true;
        }

        if (! $user->isExpert()) {
            return false;
        }

        return $report->referrals()
            ->where('expert_id', $user->getKey())
            ->whereIn('consult_status', ReportReferral::activeStatuses())
            ->exists();
    }

    public function linkDuplicate(User $user, Report $report): bool
    {
        return $user->isOfficeUser();
    }

    private function hasAssignedConsult(User $user, Report $report): bool
    {
        return $user->isExpert()
            && $report->referrals()
                ->where('expert_id', $user->getKey())
                ->exists();
    }
}
