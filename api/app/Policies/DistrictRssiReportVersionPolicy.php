<?php

namespace App\Policies;

use App\Models\DistrictRssiReportVersion;
use App\Models\User;

class DistrictRssiReportVersionPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasWebAccess();
    }

    public function view(User $user, DistrictRssiReportVersion $version): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $this->viewAny($user);
    }
}
