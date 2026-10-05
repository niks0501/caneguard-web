<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

final class SurveyPolygon implements ValidationRule
{
    public const MAX_POSITIONS = 10000;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_array($value) || ($value['type'] ?? null) !== 'Polygon'
            || array_diff(array_keys($value), ['type', 'coordinates']) !== []) {
            $fail('The polygon must be a GeoJSON Polygon with type and coordinates.');

            return;
        }

        $rings = $value['coordinates'] ?? null;
        if (! is_array($rings) || ! array_is_list($rings) || $rings === [] || count($rings) > self::MAX_POSITIONS / 4) {
            $fail('The polygon must contain at least one linear ring.');

            return;
        }

        $positions = 0;
        foreach ($rings as $ring) {
            if (! is_array($ring) || ! array_is_list($ring) || count($ring) < 4) {
                $fail('Each polygon ring must contain at least three distinct points and a closing point.');

                return;
            }

            $positions += count($ring);
            if ($positions > self::MAX_POSITIONS) {
                $fail('The polygon may contain at most 10000 positions.');

                return;
            }

            $distinct = [];
            foreach ($ring as $point) {
                if (! is_array($point) || ! array_is_list($point) || count($point) !== 2
                    || ! $this->coordinate($point[0], -180, 180)
                    || ! $this->coordinate($point[1], -90, 90)) {
                    $fail('Polygon positions must be numeric WGS84 [longitude, latitude] pairs.');

                    return;
                }

                $normalized = array_map(static fn ($coordinate): float => $coordinate == 0 ? 0.0 : (float) $coordinate, $point);
                $distinct[json_encode($normalized, JSON_THROW_ON_ERROR)] = true;
            }

            $first = $ring[0];
            $last = $ring[count($ring) - 1];
            if ((float) $first[0] !== (float) $last[0] || (float) $first[1] !== (float) $last[1]) {
                $fail('Each polygon ring must be closed: its last position must equal its first.');

                return;
            }

            if (count($distinct) < 3) {
                $fail('Each polygon ring must contain at least three distinct points.');

                return;
            }
        }
    }

    private function coordinate(mixed $value, int $minimum, int $maximum): bool
    {
        return (is_int($value) || is_float($value)) && is_finite((float) $value)
            && $value >= $minimum && $value <= $maximum;
    }
}
