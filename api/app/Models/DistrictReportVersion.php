<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DistrictReportVersion extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $hidden = ['document_bytes'];

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    public function transmissions(): HasMany
    {
        return $this->hasMany(DistrictReportTransmission::class)->orderByDesc('id');
    }

    protected function casts(): array
    {
        return ['content' => 'array', 'source_refs' => 'array', 'approved_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(function (self $version): void {
            $approvalFields = ['approved_by_id', 'approved_grant_id', 'approved_grant_revision', 'approved_at', 'approved_name', 'approved_title', 'document_sha256', 'document_bytes', 'renderer_version', 'updated_at'];
            if ($version->getOriginal('approved_at') !== null
                || array_diff(array_keys($version->getDirty()), $approvalFields) !== []) {
                throw new \LogicException('District report versions are immutable.');
            }
        });
        static::deleting(fn () => throw new \LogicException('District report history cannot be deleted.'));
    }
}
