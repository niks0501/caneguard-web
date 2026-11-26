<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isActiveAdmin();
    }

    public function create(User $actor): bool
    {
        return $actor->isActiveAdmin();
    }

    public function view(User $actor, User $target): bool
    {
        return $this->viewAny($actor) && $target->isWebUser();
    }

    /** Read-only detail and history: web users, field inspectors and farmers. Writes stay on view/update. */
    public function inspect(User $actor, User $target): bool
    {
        return $this->viewAny($actor) && ($target->isWebUser() || in_array($target->role, [User::ROLE_FIELD_REPORTER, User::ROLE_FARMER], true));
    }

    /** Farmers are managed by an active administrator only; they hold no district authority. */
    public function manageFarmer(User $actor, User $target): bool
    {
        return $actor->isActiveAdmin() && $target->role === User::ROLE_FARMER && ! $actor->is($target);
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
