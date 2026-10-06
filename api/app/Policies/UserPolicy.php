<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isActiveAdmin();
    }

    public function view(User $actor, User $target): bool
    {
        return $this->viewAny($actor) && $target->isWebUser();
    }

    public function manageLegacy(User $actor, User $target): bool
    {
        return $actor->isActiveAdmin() && in_array($target->role, User::roles(), true);
    }

    public function update(User $actor, User $target): bool
    {
        // Self-change is a validation error (422), handled by the account action.
        return $this->view($actor, $target);
    }
}
