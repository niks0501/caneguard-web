<?php

namespace App\Policies;

use App\Models\Report;
use App\Models\User;

class ReportPolicy
{
    public function before(User $user, string $ability): ?bool
    {
        if (
            $user->role === User::ROLE_ADMIN
            && in_array($ability, ['viewAny', 'view', 'review'], true)
        ) {
            return true;
        }

        return null;
    }

    public function viewAny(User $user): bool
    {
        return $user->role === User::ROLE_REVIEWER;
    }

    public function view(User $user, Report $report): bool
    {
        return $user->role === User::ROLE_REVIEWER;
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
        return $user->role === User::ROLE_REVIEWER;
    }
}
