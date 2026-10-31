<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * How the phone derived its survey measurements: the method and areas behind
 * the figures plus, when supplied, every affected-area waypoint's source,
 * accuracy and capture time. Unknown keys are kept so a newer phone can add
 * evidence without a new wire field; a supplied point history must stay
 * readable, name a real calendar instant and remain bounded.
 */
final class MeasurementProvenance implements ValidationRule
{
    public const MAX_BYTES = 262144;

    public const MAX_AFFECTED_AREA_SETS = AffectedAreaPolygons::MAX_POLYGONS;

    public const MAX_WAYPOINTS = 1500;

    private const MAX_DEPTH = 8;

    private const ISO8601 = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/D';

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_array($value) || ($value !== [] && array_is_list($value))) {
            $fail('The measurement provenance must be a JSON object of measurement details.');

            return;
        }

        if (! $this->jsonSafe($value)) {
            $fail('The measurement provenance must contain only finite numbers and valid text.');

            return;
        }

        $encoded = json_encode($value);
        if ($encoded === false || strlen($encoded) > self::MAX_BYTES) {
            $fail('The measurement provenance may be at most '.self::MAX_BYTES.' bytes of JSON.');

            return;
        }

        if (array_key_exists('affected_area_waypoint_provenance', $value)) {
            $failure = self::waypointSetsFailure($value['affected_area_waypoint_provenance']);
            if ($failure !== null) {
                $fail($failure);
            }
        }
    }

    /**
     * Every point's history is one list per affected area. The sets are stored
     * in the phone's order and are never re-paired with the submitted
     * affected-area polygons.
     */
    public static function waypointSetsFailure(mixed $sets): ?string
    {
        if (! is_array($sets) || ! array_is_list($sets)) {
            return 'The affected area waypoints must be a list of per-area waypoint lists.';
        }

        if (count($sets) > self::MAX_AFFECTED_AREA_SETS) {
            return 'The affected area waypoints may describe at most '.self::MAX_AFFECTED_AREA_SETS.' affected areas.';
        }

        $waypoints = 0;
        foreach ($sets as $set) {
            if (! is_array($set) || ! array_is_list($set)) {
                return 'Each affected area waypoint list must contain waypoint records.';
            }

            $waypoints += count($set);
            if ($waypoints > self::MAX_WAYPOINTS) {
                return 'The affected area waypoints may contain at most '.self::MAX_WAYPOINTS.' waypoints.';
            }

            foreach ($set as $waypoint) {
                $failure = self::waypointFailure($waypoint);
                if ($failure !== null) {
                    return $failure;
                }
            }
        }

        return null;
    }

    private static function waypointFailure(mixed $waypoint): ?string
    {
        if (! is_array($waypoint) || ($waypoint !== [] && array_is_list($waypoint))) {
            return 'Each affected area waypoint must be a JSON object.';
        }

        if (! in_array($waypoint['source'] ?? null, ['map', 'gps'], true)) {
            return 'Each affected area waypoint must record its source as map or gps.';
        }

        if (! array_key_exists('accuracy_meters', $waypoint)) {
            return 'Each affected area waypoint must record its accuracy_meters, which may be null.';
        }

        $accuracy = $waypoint['accuracy_meters'];
        if ($accuracy !== null
            && ((! is_int($accuracy) && ! is_float($accuracy)) || ! is_finite((float) $accuracy) || $accuracy < 0)) {
            return 'Each affected area waypoint accuracy_meters must be a non-negative number of metres or null.';
        }

        $capturedAt = $waypoint['captured_at'] ?? null;
        if (! is_string($capturedAt)
            || preg_match(self::ISO8601, $capturedAt) !== 1
            || ! self::isCalendarInstant($capturedAt)) {
            return 'Each affected area waypoint must record its captured_at as an ISO8601 date-time.';
        }

        return null;
    }

    private static function isCalendarInstant(string $value): bool
    {
        $parsed = date_parse($value);

        return $parsed['error_count'] === 0
            && $parsed['warning_count'] === 0
            && checkdate((int) $parsed['month'], (int) $parsed['day'], (int) $parsed['year']);
    }

    private function jsonSafe(mixed $value, int $depth = 0): bool
    {
        if ($depth > self::MAX_DEPTH) {
            return false;
        }

        if (is_float($value)) {
            return is_finite($value);
        }

        if (is_int($value) || is_bool($value) || $value === null) {
            return true;
        }

        if (is_string($value)) {
            return preg_match('//u', $value) === 1;
        }

        if (! is_array($value)) {
            return false;
        }

        foreach ($value as $key => $item) {
            if (! is_int($key) && (! is_string($key) || preg_match('//u', $key) !== 1)) {
                return false;
            }

            if (! $this->jsonSafe($item, $depth + 1)) {
                return false;
            }
        }

        return true;
    }
}
