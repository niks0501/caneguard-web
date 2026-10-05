<?php

namespace App\Policies;

use App\Models\Report;
use App\Models\User;
use App\Security\DistrictAccess;

class ReportPolicy
{
    public function __construct(private readonly DistrictAccess $access) {}

    public function viewAny(User $user): bool
    {
        return $this->access->office($user);
    }

    public function view(User $user, Report $report): bool
    {
        return $this->access->office($user) && $this->access->report($user, $report);
    }

    public function viewPossibleMatches(User $user, Report $report): bool
    {
        return $this->view($user, $report);
    }

    public function create(User $user): bool
    {
        return $this->access->inspector($user);
    }

    public function viewStatuses(User $user): bool
    {
        return $this->access->inspector($user);
    }

    public function review(User $user, Report $report): bool
    {
        return $this->view($user, $report);
    }

    public function linkDuplicate(User $user, Report $report): bool
    {
        return $this->view($user, $report);
    }
}
