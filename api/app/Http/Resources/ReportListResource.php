<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

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
            'submitted_at' => $this->submitted_at->utc()->toISOString(),
            'predicted_label' => $this->predicted_label,
            'confidence' => (float) $this->confidence,
            'review_status' => $this->review_status,
            'image_url' => Storage::disk('public')->url($this->image_path),
        ];
    }
}
