<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class AccountAccessEvent extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['actor_snapshot' => 'array', 'before' => 'array', 'after' => 'array', 'occurred_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        self::updating(fn () => throw new \LogicException('Access events are append-only.'));
        self::deleting(fn () => throw new \LogicException('Access events are retained with official identity history.'));
    }
}
