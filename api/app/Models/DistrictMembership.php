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
        static::saved(fn (self $membership) => app(RevokeUserAuthentication::class)->handle(User::findOrFail($membership->user_id)));
        static::deleted(fn (self $membership) => app(RevokeUserAuthentication::class)->handle(User::findOrFail($membership->user_id)));
    }
}
