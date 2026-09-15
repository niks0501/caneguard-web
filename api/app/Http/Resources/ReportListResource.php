<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReportListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'reference_code' => $this->reference_code,
            'reporter' => [
                'uuid' => $this->reporter->uuid,
                'name' => $this->reporter->name,
            ],
            'barangay' => $this->barangay,
            'province' => $this->province,
            'municipality' => $this->municipality,
            'observed_at' => $this->observed_at?->utc()->toISOString(),
            'captured_at' => $this->captured_at->utc()->toISOString(),
            'submitted_at' => $this->submitted_at->utc()->toISOString(),
            'predicted_label' => $this->predicted_label,
            'confidence' => (float) $this->confidence,
            'review_status' => $this->review_status,
            'lifecycle' => $this->resource->lifecycleSnapshot(),
            'authority_classified_condition' => $this->authority_classified_condition,
            'location_unavailable' => $this->resource->hasLocationUnavailable(),
            'location_unavailable_reason' => $this->location_unavailable_reason,
            'affected_area_measurement' => $this->resource->affectedAreaMeasurement(),
            'affected_portion_measurement' => $this->resource->affectedPortionMeasurement(),
            'follow_up' => [
                'due_on' => $this->fieldValidationAssignment?->target_visit_date?->format('Y-m-d'),
                'overdue' => $this->fieldValidationAssignment?->target_visit_date !== null
                    && $this->fieldValidationAssignment->target_visit_date
                        ->lt(now()->startOfDay()),
            ],
            'mismatch_reported' => $this->mismatch_reported,
            'image_url' => route(
                'api.v1.reports.image',
                ['report' => $this->uuid],
            ),
        ];
    }
}
