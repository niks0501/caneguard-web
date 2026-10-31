<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * The phone's point history for its affected areas: one list of waypoints per
 * area, held to the same waypoint rules and budget as the nested
 * measurement_provenance.affected_area_waypoint_provenance evidence.
 */
final class AffectedAreaWaypoints implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $failure = MeasurementProvenance::waypointSetsFailure($value);

        if ($failure !== null) {
            $fail($failure);
        }
    }
}
