<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReportStatusResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'client_uuid' => $this->client_uuid,
            'reference_code' => $this->reference_code,
            'review_status' => $this->review_status,
            'review_notes' => $this->review_notes,
            'reviewed_at' => $this->reviewed_at?->utc()->toISOString(),
            'updated_at' => $this->updated_at->utc()->toISOString(),
        ];
    }
}
