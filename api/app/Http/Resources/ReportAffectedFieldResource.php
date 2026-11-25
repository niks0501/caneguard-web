<?php

namespace App\Http\Resources;

use App\Models\FieldSurvey;
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
            'affected_area_sqm' => $this->affected_area_sqm === null ? null : (float) $this->affected_area_sqm,
            'affected_percent' => self::affectedPercent($this->resource),
            // Retired office input, kept as history; null once never entered.
            'loss_rate_percent' => $this->pivot->loss_rate_percent === null
                ? null
                : (float) $this->pivot->loss_rate_percent,
        ];
    }

    /**
     * The phone's measured share of the plot that is affected, or null when no
     * affected area was drawn or the plot has no usable area.
     */
    public static function affectedPercent(FieldSurvey $survey): ?float
    {
        if ($survey->affected_area_sqm === null || (float) $survey->area_sqm <= 0) {
            return null;
        }

        return round(min(100.0, (float) $survey->affected_area_sqm / (float) $survey->area_sqm * 100), 1);
    }
}
