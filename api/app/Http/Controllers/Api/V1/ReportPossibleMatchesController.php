<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\FindPossibleRecentMatches;
use App\Http\Controllers\Controller;
use App\Http\Resources\PossibleRecentMatchResource;
use App\Models\Report;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ReportPossibleMatchesController extends Controller
{
    public function __invoke(
        Report $report,
        FindPossibleRecentMatches $findPossibleRecentMatches,
    ): AnonymousResourceCollection {
        $this->authorize('view', $report);

        $matches = $findPossibleRecentMatches->handle(
            (string) $report->predicted_label,
            $report->final_latitude === null ? null : (float) $report->final_latitude,
            $report->final_longitude === null ? null : (float) $report->final_longitude,
            (int) $report->getKey(),
        );

        return PossibleRecentMatchResource::collection($matches)
            ->additional([
                'message' => $matches->isNotEmpty()
                    ? 'Possible recent matches found. Compare the submitted evidence before deciding.'
                    : 'No possible recent match was found for this case.',
                'meta' => [
                    'possible_match' => $matches->isNotEmpty(),
                    'can_submit' => true,
                    'assessment' => $report->final_latitude !== null
                        && $report->final_longitude !== null
                        ? 'condition_and_location'
                        : 'location_unavailable',
                    'recent_window_hours' => $findPossibleRecentMatches->recentWindowHours(),
                    'location_radius_meters' => $findPossibleRecentMatches->radiusMeters(),
                ],
            ]);
    }
}
