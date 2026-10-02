<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FieldValidationCompletionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'client_uuid' => $this->client_uuid,
            'assignment_uuid' => $this->assignment->uuid,
            'field_observation' => $this->field_observation,
            'field_finding' => $this->field_finding,
            'action_taken' => $this->action_taken,
            'follow_up_outcome' => $this->follow_up_outcome,
            'visited_at' => $this->visited_at->utc()->toISOString(),
            'gps' => [
                'outcome' => $this->gps_outcome,
                'attempted_at' => $this->gps_attempted_at->utc()->toISOString(),
                'latitude' => $this->gps_latitude === null ? null : (float) $this->gps_latitude,
                'longitude' => $this->gps_longitude === null ? null : (float) $this->gps_longitude,
                'accuracy' => $this->gps_accuracy === null ? null : (float) $this->gps_accuracy,
            ],
            'fresh_photo' => [
                'available' => $this->fresh_photo_path !== null,
                'url' => $this->fresh_photo_path !== null
                    ? route('api.v1.reports.validation-photo', [
                        'report' => $this->assignment->report->uuid,
                    ], false)
                    : null,
                'mime_type' => $this->fresh_photo_mime_type,
                'size_bytes' => $this->fresh_photo_size_bytes,
            ],
            'created_at' => $this->created_at->utc()->toISOString(),
            'updated_at' => $this->updated_at->utc()->toISOString(),
        ];
    }
}
