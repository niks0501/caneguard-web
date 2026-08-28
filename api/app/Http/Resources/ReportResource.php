<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'identity' => [
                'uuid' => $this->uuid,
                'reference_code' => $this->reference_code,
                'client_uuid' => $this->client_uuid,
                'scan_record_client_uuid' => $this->scan_record_client_uuid,
            ],
            'reporter' => [
                'uuid' => $this->reporter->uuid,
                'name' => $this->reporter->name,
                'email' => $this->reporter->email,
            ],
            'barangay' => $this->barangay,
            'timestamps' => [
                'captured_at' => $this->captured_at->utc()->toISOString(),
                'observed_at' => $this->observed_at?->utc()->toISOString(),
                'submitted_at' => $this->submitted_at->utc()->toISOString(),
            ],
            'image' => [
                'url' => route(
                    'api.v1.reports.image',
                    ['report' => $this->uuid],
                ),
                'mime_type' => $this->image_mime_type,
                'size_bytes' => $this->image_size_bytes,
                'source_type' => $this->image_source_type,
                'source_width' => $this->source_width,
                'source_height' => $this->source_height,
            ],
            'model' => [
                'predicted_label' => $this->predicted_label,
                'confidence' => (float) $this->confidence,
                'class_scores' => $this->classScores
                    ->map(fn ($score) => [
                        'label' => $score->label,
                        'score' => (float) $score->score,
                    ])
                    ->values(),
                'model_version' => $this->model_version,
                'timings_ms' => [
                    'preprocess' => (float) $this->preprocess_ms,
                    'inference' => (float) $this->inference_ms,
                    'total' => (float) $this->total_ms,
                ],
            ],
            'observations' => [
                'symptom_keys' => $this->symptoms->pluck('symptom_key')->values(),
                'checklist_consistency' => $this->checklist_consistency,
                'reported_severity' => $this->reported_severity,
                'quality_warnings' => $this->qualityWarnings
                    ->pluck('warning_key')
                    ->values(),
                'sugarcane_variety' => $this->sugarcane_variety,
                'crop_age' => $this->crop_age,
                'cane_class' => $this->cane_class,
                'affected_area_hectares' => $this->affected_area_hectares === null
                    ? null
                    : (float) $this->affected_area_hectares,
                'affected_portion_percent' => $this->affected_portion_percent === null
                    ? null
                    : (float) $this->affected_portion_percent,
                'field_notes' => $this->field_notes,
                'farmer_or_farm_owner_name' => $this->farmer_or_farm_owner_name,
                'province' => $this->province,
                'municipality' => $this->municipality,
                'final_latitude' => $this->final_latitude === null
                    ? null
                    : (float) $this->final_latitude,
                'final_longitude' => $this->final_longitude === null
                    ? null
                    : (float) $this->final_longitude,
                'location_source' => $this->location_source,
                'gps_accuracy' => $this->gps_accuracy === null
                    ? null
                    : (float) $this->gps_accuracy,
            ],
            'reporter_observation' => [
                'mismatch_reported' => $this->mismatch_reported,
                'reporter_suspected_condition' => $this->reporter_suspected_condition,
                'reporter_observation_text' => $this->reporter_observation_text,
            ],
            'review' => [
                'status' => $this->review_status,
                'notes' => $this->review_notes,
                'authority_classified_condition' => $this->authority_classified_condition,
                'reviewer' => $this->when($this->reviewer, fn () => [
                    'uuid' => $this->reviewer->uuid,
                    'name' => $this->reviewer->name,
                ]),
                'reviewed_at' => $this->reviewed_at?->utc()->toISOString(),
            ],
            'lifecycle' => $this->resource->lifecycleSnapshot(),
            'version' => $this->lock_version,
            'updated_at' => $this->updated_at->utc()->toISOString(),
        ];
    }
}
