<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DistrictReportEvent extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('District report audit is append-only.'));
        static::deleting(fn () => throw new \LogicException('District report audit is append-only.'));
    }
}
