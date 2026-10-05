<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

class FindPossibleRecentMatches
{
    /**
     * Find nearby reports with the same model condition from the recent
     * submission window.
     *
     * The result is decision support only. It never changes a report and it
     * deliberately requires both a matching condition and a nearby location.
     *
     * @return Collection<int, Report>
     */
    public function handle(
        string $predictedLabel,
        ?float $latitude,
        ?float $longitude,
        ?int $excludeReportId = null,
    ): Collection {
        if ($latitude === null || $longitude === null) {
            return new Collection;
        }

        $radiusMeters = $this->radiusMeters();
        $latitudeDelta = $radiusMeters / 111_320;
        $longitudeDelta = $latitudeDelta / max(cos(deg2rad($latitude)), 0.01);
        $now = CarbonImmutable::now()->utc();
        $minimumSubmittedAt = $now->subHours($this->windowHours());

        $candidates = Report::query()->visibleTo(request()->user())
            ->where('predicted_label', $predictedLabel)
            ->whereBetween('submitted_at', [$minimumSubmittedAt, $now])
            ->whereNotNull('final_latitude')
            ->whereNotNull('final_longitude')
            ->whereBetween('final_latitude', [
                max(-90, $latitude - $latitudeDelta),
                min(90, $latitude + $latitudeDelta),
            ])
            ->whereBetween('final_longitude', [
                max(-180, $longitude - $longitudeDelta),
                min(180, $longitude + $longitudeDelta),
            ])
            ->when(
                $excludeReportId !== null,
                fn ($query) => $query->where('id', '!=', $excludeReportId),
            )
            ->orderByDesc('submitted_at')
            ->orderByDesc('id')
            ->limit($this->maxCandidates())
            ->get();

        return $candidates
            ->map(function (Report $report) use ($latitude, $longitude, $radiusMeters): ?Report {
                $distance = $this->distanceMeters(
                    $latitude,
                    $longitude,
                    (float) $report->final_latitude,
                    (float) $report->final_longitude,
                );

                if ($distance > $radiusMeters) {
                    return null;
                }

                $report->setAttribute(
                    'possible_match_distance_meters',
                    round($distance, 1),
                );

                return $report;
            })
            ->filter()
            ->take($this->maxMatches())
            ->values();
    }

    public function recentWindowHours(): int
    {
        return max(1, (int) config(
            'caneguard.duplicate_assistance.recent_window_hours',
            72,
        ));
    }

    public function radiusMeters(): float
    {
        return max(1, (float) config(
            'caneguard.duplicate_assistance.location_radius_meters',
            100,
        ));
    }

    public function maxMatches(): int
    {
        return max(1, (int) config(
            'caneguard.duplicate_assistance.max_matches',
            5,
        ));
    }

    private function windowHours(): int
    {
        return $this->recentWindowHours();
    }

    private function maxCandidates(): int
    {
        return max($this->maxMatches(), (int) config(
            'caneguard.duplicate_assistance.max_candidates',
            200,
        ));
    }

    private function distanceMeters(
        float $latitudeOne,
        float $longitudeOne,
        float $latitudeTwo,
        float $longitudeTwo,
    ): float {
        $latitudeDelta = deg2rad($latitudeTwo - $latitudeOne);
        $longitudeDelta = deg2rad($longitudeTwo - $longitudeOne);
        $latitudeOne = deg2rad($latitudeOne);
        $latitudeTwo = deg2rad($latitudeTwo);

        $haversine = sin($latitudeDelta / 2) ** 2
            + cos($latitudeOne) * cos($latitudeTwo)
            * sin($longitudeDelta / 2) ** 2;

        return 6_371_000 * 2 * asin(sqrt(min(1, $haversine)));
    }
}
