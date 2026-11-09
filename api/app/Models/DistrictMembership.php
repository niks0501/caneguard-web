<?php

namespace App\Models;

use App\Actions\Auth\RevokeUserAuthentication;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'district_id', 'revoked_at'])]
class DistrictMembership extends Model
{
    protected static function booted(): void
    {
        $invalidate = function (self $membership): void {
            $user = User::findOrFail($membership->user_id);
            if ($user->isWebUser()) {
                return; // District metadata is not Web authority.
            }

            User::query()->whereKey($membership->user_id)->increment('access_version');
            if ($user->isMobileUser()) {
                // Mobile bearer sessions survive membership changes, including a
                // demotion that already changed the role, so upload endpoints can
                // answer a record-scoped CAPABILITY_REVOKED.
                return;
            }

            app(RevokeUserAuthentication::class)->handle($user);
        };
        static::saved($invalidate);
        static::deleted($invalidate);
    }
}
