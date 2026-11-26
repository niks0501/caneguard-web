<?php

namespace App\Policies;

use App\Models\FarmerInquiry;
use App\Models\User;

/** The office queue for farmer requests: verified, active Web staff only. */
class FarmerInquiryPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasWebAccess();
    }

    public function view(User $actor, FarmerInquiry $inquiry): bool
    {
        return $actor->hasWebAccess();
    }

    public function respond(User $actor, FarmerInquiry $inquiry): bool
    {
        return $actor->hasWebAccess();
    }
}
