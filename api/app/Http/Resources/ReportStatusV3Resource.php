<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Mobile status snapshot with the Phase 3 office advisory payload. */
class ReportStatusV3Resource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $advisory = $this->advisory;

        return [
            'uuid' => $this->uuid,
            'client_uuid' => $this->client_uuid,
            'reference_code' => $this->reference_code,
            'review_status' => $this->review_status,
            'review_notes' => $this->review_notes,
            'reviewed_at' => $this->reviewed_at?->utc()->toISOString(),
            'updated_at' => $this->updated_at->utc()->toISOString(),
            'advisory' => $advisory ? [
                'uuid' => $advisory->uuid,
                'code' => $advisory->code,
                'title' => $advisory->title,
                'content' => $advisory->content,
                'status' => $advisory->status,
                'selected_at' => $this->advisory_selected_at?->utc()->toISOString(),
                'delivery_state' => $this->advisory_delivery_state,
                'delivered_at' => $this->advisory_delivered_at?->utc()->toISOString(),
                'validated_at' => $advisory->validated_at?->utc()->toISOString(),
            ] : null,
        ];
    }
}
