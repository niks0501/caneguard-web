<?php

namespace App\Http\Resources;

use App\Models\Report;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Report */
class PossibleRecentMatchResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'case' => [
                'uuid' => $this->uuid,
                'reference_code' => $this->reference_code,
                'submitted_at' => $this->submitted_at->utc()->toISOString(),
            ],
            'match' => [
                'condition' => $this->predicted_label,
                'distance_meters' => (float) $this->getAttribute(
                    'possible_match_distance_meters',
                ),
                'basis' => [
                    'same_condition',
                    'nearby_location',
                    'recent_submission',
                ],
            ],
            'message' => 'Possible recent match. Compare this case before deciding.',
        ];
    }
}
