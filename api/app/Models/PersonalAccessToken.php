<?php

namespace App\Models;

use App\Actions\Auth\IssueMobileToken;
use Laravel\Sanctum\PersonalAccessToken as SanctumPersonalAccessToken;

class PersonalAccessToken extends SanctumPersonalAccessToken
{
    /**
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'token',
        'abilities',
        'expires_at',
        'device_id',
    ];

    public function isMobileInspectorSession(): bool
    {
        return is_string($this->name)
            && str_starts_with($this->name, IssueMobileToken::TOKEN_NAME_PREFIX)
            && ($this->can('report:submit') || $this->can('assignment:complete'));
    }
}
