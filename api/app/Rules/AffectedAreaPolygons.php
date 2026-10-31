<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * The affected areas are a list of GeoJSON polygons describing the damaged
 * parts of the walked boundary. Every polygon is validated by SurveyPolygon;
 * this rule keeps the whole list to the same position budget the phone
 * enforces, so one submission cannot carry an unbounded geometry payload.
 */
final class AffectedAreaPolygons implements ValidationRule
{
    public const MAX_POLYGONS = 100;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_array($value) || ! array_is_list($value)) {
            $fail('The affected area polygons must be a JSON array of GeoJSON Polygon objects.');

            return;
        }

        if (count($value) > self::MAX_POLYGONS) {
            $fail('The affected area polygons may contain at most '.self::MAX_POLYGONS.' polygons.');

            return;
        }

        $positions = 0;
        foreach ($value as $polygon) {
            if (! is_array($polygon) || ! is_array($polygon['coordinates'] ?? null)) {
                continue;
            }

            foreach ($polygon['coordinates'] as $ring) {
                $positions += is_array($ring) ? count($ring) : 0;
            }
        }

        if ($positions > SurveyPolygon::MAX_POSITIONS) {
            $fail('The affected area polygons may contain at most '.SurveyPolygon::MAX_POSITIONS.' positions in total.');
        }
    }
}
