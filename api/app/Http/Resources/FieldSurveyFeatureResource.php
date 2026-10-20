<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FieldSurveyFeatureResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'type' => 'Feature',
            'id' => (string) $this->id,
            'geometry' => $this->polygon,
            'properties' => [
                'id' => $this->id,
                'captured_at' => $this->captured_at->utc()->format('Y-m-d\\TH:i:s.u\\Z'),
                'area_sqm' => (float) $this->area_sqm,
                'area_source' => 'device_reported',
                'inspector' => [
                    'uuid' => $this->inspector->uuid,
                    'name' => $this->inspector->name,
                ],
            ],
        ];
    }
}
