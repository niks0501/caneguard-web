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
    'label',
    'outline_from_survey_id',
    'affected_area_polygons',
    'affected_area_sqm',
    'affected_area_measurement',
    'measurement_provenance',
    'affected_area_waypoints',
    'captured_at',
])]
class FieldSurvey extends Model
{
    /** The affected area was measured; zero is a confirmed "none found". */
    public const MEASUREMENT_MEASURED = 'measured';

    /** The affected area was not measured; the figure is unknown, never zero. */
    public const MEASUREMENT_NOT_MEASURED = 'not_measured';

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'polygon' => 'array',
            'area_sqm' => 'double',
            'affected_area_polygons' => 'array',
            'affected_area_sqm' => 'decimal:4',
            'affected_area_measurement' => 'string',
            'measurement_provenance' => 'array',
            'affected_area_waypoints' => 'array',
            'captured_at' => 'immutable_datetime',
        ];
    }

    /**
     * Resolve whether the affected area was measured.
     *
     * A stored value wins. Older rows have none: an absent figure, or a zero
     * with no affected polygons (what older phones forced for a plot-only
     * survey), could never have been a confirmed measurement, so both read as
     * not measured. Zero is never inferred as measured from empty polygons.
     */
    public function affectedAreaMeasurement(): string
    {
        if ($this->affected_area_measurement !== null) {
            return $this->affected_area_measurement;
        }

        if ($this->affected_area_sqm === null) {
            return self::MEASUREMENT_NOT_MEASURED;
        }

        return (float) $this->affected_area_sqm <= 0.0 && $this->hasNoAffectedPolygons()
            ? self::MEASUREMENT_NOT_MEASURED
            : self::MEASUREMENT_MEASURED;
    }

    public function hasNoAffectedPolygons(): bool
    {
        return $this->affected_area_polygons === null || $this->affected_area_polygons === [];
    }

    public function inspector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inspector_id');
    }
}
