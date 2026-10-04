<?php

namespace App\Models;

use App\Actions\Auth\RevokeUserAuthentication;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'district_id', 'ability', 'revoked_at'])]
class DistrictGrant extends Model
{
    public const ABILITIES = ['report:approve', 'report:send', 'staff:manage'];

    protected static function booted(): void
    {
        static::updating(function (self $grant): void {
            $grant->revision = ((int) $grant->getOriginal('revision')) + 1;
        });
        static::saved(fn (self $grant) => app(RevokeUserAuthentication::class)->handle(User::findOrFail($grant->user_id)));
        static::deleted(fn (self $grant) => app(RevokeUserAuthentication::class)->handle(User::findOrFail($grant->user_id)));
    }
}
