<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DistrictRssiReportVersion extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $hidden = ['pdf_bytes', 'csv_content', 'district_id'];

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    protected function casts(): array
    {
        return [
            'content' => 'array',
            'source_refs' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Weekly RSSI report versions are immutable.'));
        static::deleting(fn () => throw new \LogicException('Weekly RSSI report history cannot be deleted.'));
    }
}
