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
                'label' => $this->label,
                'outline_from_survey_id' => $this->outline_from_survey_id === null ? null : (int) $this->outline_from_survey_id,
                'captured_at' => $this->captured_at->utc()->format('Y-m-d\\TH:i:s.u\\Z'),
                'area_sqm' => (float) $this->area_sqm,
                'area_source' => 'device_reported',
                'affected_areas' => $this->affected_area_polygons ?? [],
                'affected_area_sqm' => $this->affected_area_sqm === null
                    ? null
                    : (float) $this->affected_area_sqm,
                'affected_area_measurement' => $this->resource->affectedAreaMeasurement(),
                'cases' => $this->resource->getAttribute('case_links') ?? [],
                'inspector' => [
                    'uuid' => $this->inspector->uuid,
                    'name' => $this->inspector->name,
                ],
            ],
        ];
    }
}
