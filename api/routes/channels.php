<?php

use App\Models\User;
use App\Security\DistrictAccess;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('users.{uuid}', function (User $user, string $uuid): bool {
    return app(DistrictAccess::class)->office($user)
        && hash_equals($user->uuid, $uuid);
}, ['guards' => ['web']]);
