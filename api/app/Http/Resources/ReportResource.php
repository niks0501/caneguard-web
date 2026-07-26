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
            ],
            'reporter' => [
                'uuid' => $this->reporter->uuid,
                'name' => $this->reporter->name,
                'email' => $this->reporter->email,
            ],
            'barangay' => $this->barangay,
            'timestamps' => [
                'captured_at' => $this->captured_at->utc()->toISOString(),
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
            ],
            'review' => [
                'status' => $this->review_status,
                'notes' => $this->review_notes,
                'reviewer' => $this->when($this->reviewer, fn () => [
                    'uuid' => $this->reviewer->uuid,
                    'name' => $this->reviewer->name,
                ]),
                'reviewed_at' => $this->reviewed_at?->utc()->toISOString(),
            ],
            'updated_at' => $this->updated_at->utc()->toISOString(),
        ];
    }
}
