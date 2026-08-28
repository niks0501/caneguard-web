<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('users.{uuid}', function (User $user, string $uuid): bool {
    return $user->isWebUser()
        && hash_equals($user->uuid, $uuid);
}, ['guards' => ['web']]);
