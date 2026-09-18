<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FieldValidationQueueResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'reference_code' => $this->reference_code,
            'barangay' => $this->barangay,
            'province' => $this->province,
            'municipality' => $this->municipality,
            'observed_at' => $this->observed_at?->utc()->toISOString(),
            'submitted_at' => $this->submitted_at->utc()->toISOString(),
            'predicted_label' => $this->predicted_label,
            'confidence' => (float) $this->confidence,
            'review_status' => $this->review_status,
            'lifecycle' => $this->resource->lifecycleSnapshot(),
            'target_visit_date' => $this->resource->relationLoaded('fieldValidationAssignment')
                ? $this->resource->fieldValidationAssignment?->target_visit_date?->format('Y-m-d')
                : null,
            'assignee' => $this->resource->relationLoaded('fieldValidationAssignment') && $this->resource->fieldValidationAssignment?->assignee
                ? [
                    'uuid' => $this->resource->fieldValidationAssignment->assignee->uuid,
                    'name' => $this->resource->fieldValidationAssignment->assignee->name,
                ]
                : null,
            'final_latitude' => $this->final_latitude === null
                ? null
                : (float) $this->final_latitude,
            'final_longitude' => $this->final_longitude === null
                ? null
                : (float) $this->final_longitude,
            'location_source' => $this->location_source,
            'location_unavailable' => $this->resource->hasLocationUnavailable(),
            'location_unavailable_reason' => $this->location_unavailable_reason,
            'gps_accuracy' => $this->gps_accuracy === null
                ? null
                : (float) $this->gps_accuracy,
            'affected_area_hectares' => $this->affected_area_hectares === null
                ? null
                : (float) $this->affected_area_hectares,
            'affected_portion_percent' => $this->affected_portion_percent === null
                ? null
                : (float) $this->affected_portion_percent,
        ];
    }
}
