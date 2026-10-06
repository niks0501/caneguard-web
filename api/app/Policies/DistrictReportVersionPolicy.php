<?php

namespace App\Policies;

use App\Models\DistrictReportVersion;
use App\Models\User;

class DistrictReportVersionPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasWebAccess();
    }

    public function view(User $user, DistrictReportVersion $version): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $this->viewAny($user);
    }

    public function approve(User $user, DistrictReportVersion $version): bool
    {
        return $user->isActiveAdmin();
    }

    public function send(User $user, DistrictReportVersion $version): bool
    {
        return $user->isActiveAdmin();
    }
}
