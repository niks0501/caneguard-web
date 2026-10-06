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
            if (User::findOrFail($membership->user_id)->isWebUser()) {
                return; // District metadata is not Web authority.
            }
            User::query()->whereKey($membership->user_id)->increment('access_version');
            app(RevokeUserAuthentication::class)->handle(User::findOrFail($membership->user_id));
        };
        static::saved($invalidate);
        static::deleted($invalidate);
    }
}
