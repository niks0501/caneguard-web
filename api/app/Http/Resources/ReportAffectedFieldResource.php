<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReportAffectedFieldResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'field_survey_id' => (int) $this->getKey(),
            'geometry' => $this->polygon,
            'captured_at' => $this->captured_at->utc()->format('Y-m-d\\TH:i:s.u\\Z'),
            'area_sqm' => (float) $this->area_sqm,
            'area_source' => 'device_reported',
            'inspector' => [
                'uuid' => $this->inspector->uuid,
                'name' => $this->inspector->name,
            ],
            'loss_rate_percent' => (float) $this->pivot->loss_rate_percent,
        ];
    }
}
