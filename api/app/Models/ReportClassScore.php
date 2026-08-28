<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['report_id', 'label', 'score'])]
class ReportClassScore extends Model
{
    protected static function booted(): void
    {
        static::updating(function (): never {
            throw new \LogicException('Synchronized model evidence is immutable.');
        });

        static::deleting(function (): never {
            throw new \LogicException('Synchronized model evidence is immutable.');
        });
    }

    public $incrementing = false;

    public $timestamps = false;

    /**
     * @return BelongsTo<Report, $this>
     */
    public function report(): BelongsTo
    {
        return $this->belongsTo(Report::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'score' => 'decimal:7',
        ];
    }
}
