<?php

namespace App\Http\Controllers\Api\V2;

use App\Actions\Reports\FindPossibleRecentMatches;
use App\Http\Controllers\Controller;
use App\Http\Requests\PossibleRecentMatchesV2Request;
use App\Http\Resources\PossibleRecentMatchResource;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MobilePossibleRecentMatchesController extends Controller
{
    public function __invoke(
        PossibleRecentMatchesV2Request $request,
        FindPossibleRecentMatches $findPossibleRecentMatches,
    ): AnonymousResourceCollection {
        $data = $request->validated();
        $hasLocation = array_key_exists('final_latitude', $data)
            && array_key_exists('final_longitude', $data)
            && $data['final_latitude'] !== null
            && $data['final_longitude'] !== null;
        $matches = $findPossibleRecentMatches->handle(
            $data['predicted_label'],
            $hasLocation ? (float) $data['final_latitude'] : null,
            $hasLocation ? (float) $data['final_longitude'] : null,
        );

        return PossibleRecentMatchResource::collection($matches)
            ->additional([
                'message' => $matches->isNotEmpty()
                    ? 'Possible recent matches found. You can still submit a new case.'
                    : 'No possible recent match was found. You can still submit a new case.',
                'meta' => [
                    'possible_match' => $matches->isNotEmpty(),
                    'can_submit' => true,
                    'assessment' => $hasLocation
                        ? 'condition_and_location'
                        : 'location_unavailable',
                    'recent_window_hours' => $findPossibleRecentMatches->recentWindowHours(),
                    'location_radius_meters' => $findPossibleRecentMatches->radiusMeters(),
                ],
            ]);
    }
}
