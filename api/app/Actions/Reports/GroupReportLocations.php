<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Illuminate\Database\Eloquent\Collection;

/** Response-local, transitive proximity groups. Never query outside the visible slice. */
final class GroupReportLocations
{
    private const EARTH_RADIUS_METERS = 6371008.8;

    /** @param Collection<int, Report> $reports */
    public function handle(Collection $reports): void
    {
        $radius = max(1, (float) config('caneguard.map.location_group_radius_meters', 25));
        $parents = [];
        $buckets = [];
        $points = [];
        $ordered = $reports->sortBy('id')->values();

        // Earth-centered metre buckets avoid longitude seams and polar distortion.
        // Any pair within the surface radius is also within that chord radius,
        // so only the 27 adjacent 3-D buckets can contain a candidate.
        foreach ($ordered as $index => $report) {
            $latitude = deg2rad((float) $report->final_latitude);
            $longitude = deg2rad((float) $report->final_longitude);
            $points[$index] = [
                self::EARTH_RADIUS_METERS * cos($latitude) * cos($longitude),
                self::EARTH_RADIUS_METERS * cos($latitude) * sin($longitude),
                self::EARTH_RADIUS_METERS * sin($latitude),
            ];
            [$x, $y, $z] = array_map(fn (float $value): int => (int) floor($value / $radius), $points[$index]);
            $parents[$index] = $index;
            for ($dx = -1; $dx <= 1; $dx++) {
                for ($dy = -1; $dy <= 1; $dy++) {
                    for ($dz = -1; $dz <= 1; $dz++) {
                        foreach ($buckets[($x + $dx).':'.($y + $dy).':'.($z + $dz)] ?? [] as $candidate) {
                            $chord = sqrt(array_sum(array_map(
                                fn (float $a, float $b): float => ($a - $b) ** 2,
                                $points[$index],
                                $points[$candidate],
                            )));
                            $distance = 2 * self::EARTH_RADIUS_METERS * asin(min(1, $chord / (2 * self::EARTH_RADIUS_METERS)));
                            if ($distance <= $radius) {
                                $left = $this->root($parents, $index);
                                $right = $this->root($parents, $candidate);
                                $parents[max($left, $right)] = min($left, $right);
                            }
                        }
                    }
                }
            }
            $buckets[$x.':'.$y.':'.$z][] = $index;
        }

        $groups = [];
        foreach ($ordered as $index => $report) {
            $groups[$this->root($parents, $index)][] = $report;
        }
        foreach ($groups as $members) {
            $anchor = $members[0];
            foreach ($members as $report) {
                // Ephemeral attributes only: original evidence coordinates never change.
                $report->setAttribute('location_group_key', $anchor->uuid);
                $report->setAttribute('location_group_size', count($members));
                $report->setAttribute('location_group_coordinates', [
                    (float) $anchor->final_longitude,
                    (float) $anchor->final_latitude,
                ]);
            }
        }
    }

    /** @param array<int, int> $parents */
    private function root(array &$parents, int $index): int
    {
        while ($parents[$index] !== $index) {
            $parents[$index] = $parents[$parents[$index]];
            $index = $parents[$index];
        }

        return $index;
    }
}
