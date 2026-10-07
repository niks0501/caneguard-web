<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MapReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'type' => 'Feature',
            'id' => $this->uuid,
            'geometry' => [
                'type' => 'Point',
                'coordinates' => [
                    (float) $this->final_longitude,
                    (float) $this->final_latitude,
                ],
            ],
            'properties' => [
                'uuid' => $this->uuid,
                'location_group_key' => $this->location_group_key,
                'location_group_size' => $this->location_group_size,
                'location_group_coordinates' => $this->location_group_coordinates,
                'reference_code' => $this->reference_code,
                'barangay' => $this->barangay,
                'farm_reference' => $this->farmer_or_farm_owner_name ?: $this->barangay,
                'province' => $this->province,
                'municipality' => $this->municipality,
                'observed_at' => $this->observed_at?->utc()->toISOString(),
                'submitted_at' => $this->submitted_at->utc()->toISOString(),
                'first_reviewed_at' => $this->first_reviewed_at?->utc()->toISOString(),
                'predicted_label' => $this->predicted_label,
                'confidence' => (float) $this->confidence,
                'review_status' => $this->review_status,
                'lifecycle' => $this->resource->lifecycleSnapshot(),
                'authority_classified_condition' => $this->authority_classified_condition,
                'action_taken' => $this->action_taken,
                'mismatch_reported' => $this->mismatch_reported,
                'scheduled_revisit' => (bool) $this->scheduled_revisit,
                'location_source' => $this->location_source,
                'gps_accuracy' => $this->gps_accuracy === null
                    ? null
                    : (float) $this->gps_accuracy,
                'affected_area_hectares' => $this->affected_area_hectares === null
                    ? null
                    : (float) $this->affected_area_hectares,
                'affected_area_measurement' => $this->resource->affectedAreaMeasurement(),
                'affected_portion_percent' => $this->affected_portion_percent === null
                    ? null
                    : (float) $this->affected_portion_percent,
            ],
        ];
    }
}
