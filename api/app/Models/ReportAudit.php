<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use JsonException;

#[Fillable([
    'report_id',
    'actor_id',
    'field',
    'original_value',
    'corrected_value',
    'reason',
    'created_at',
])]
class ReportAudit extends Model
{
    public $timestamps = false;

    /**
     * @return BelongsTo<Report, $this>
     */
    public function report(): BelongsTo
    {
        return $this->belongsTo(Report::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /**
     * Keep scalar values typed when they cross the audit API boundary.
     *
     * @throws JsonException
     */
    public function setOriginalValueAttribute(mixed $value): void
    {
        $this->attributes['original_value'] = $value === null
            ? null
            : json_encode($value, JSON_THROW_ON_ERROR);
    }

    /**
     * @throws JsonException
     */
    public function setCorrectedValueAttribute(mixed $value): void
    {
        $this->attributes['corrected_value'] = $value === null
            ? null
            : json_encode($value, JSON_THROW_ON_ERROR);
    }

    /**
     * @throws JsonException
     */
    public function getOriginalValueAttribute(?string $value): mixed
    {
        return $value === null
            ? null
            : json_decode($value, associative: true, flags: JSON_THROW_ON_ERROR);
    }

    /**
     * @throws JsonException
     */
    public function getCorrectedValueAttribute(?string $value): mixed
    {
        return $value === null
            ? null
            : json_decode($value, associative: true, flags: JSON_THROW_ON_ERROR);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'created_at' => 'immutable_datetime',
        ];
    }
}
