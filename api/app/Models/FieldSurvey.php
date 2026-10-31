<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'client_uuid',
    'inspector_id',
    'district_id',
    'polygon',
    'area_sqm',
    'affected_area_polygons',
    'affected_area_sqm',
    'measurement_provenance',
    'captured_at',
])]
class FieldSurvey extends Model
{
    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'polygon' => 'array',
            'area_sqm' => 'double',
            'affected_area_polygons' => 'array',
            'affected_area_sqm' => 'decimal:4',
            'measurement_provenance' => 'array',
            'captured_at' => 'immutable_datetime',
        ];
    }

    public function inspector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inspector_id');
    }
}
