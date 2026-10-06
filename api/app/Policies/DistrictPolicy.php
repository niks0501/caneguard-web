<?php

namespace App\Policies;

use App\Models\District;
use App\Models\User;

class DistrictPolicy
{
    public function update(User $user, District $district): bool
    {
        return $user->isActiveAdmin();
    }
}
