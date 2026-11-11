<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'uuid',
    'report_id',
    'uploaded_by',
    'image_path',
    'image_mime_type',
    'image_size_bytes',
    'image_width',
    'image_height',
    'mask_path',
    'mask_width',
    'mask_height',
    'normal_canopy_percent',
    'abnormal_canopy_percent',
    'canopy_coverage_percent',
    'model_version',
    'weights_sha256',
    'inference_ms',
    'removed_at',
    'removed_by',
    'removal_id',
])]
class ReportAerialAnalysis extends Model
{
    protected function casts(): array
    {
        return [
            'normal_canopy_percent' => 'float',
            'abnormal_canopy_percent' => 'float',
            'canopy_coverage_percent' => 'float',
            'removed_at' => 'immutable_datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

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
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
