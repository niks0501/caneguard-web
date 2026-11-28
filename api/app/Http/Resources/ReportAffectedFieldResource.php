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
            'label' => $this->label,
            'outline_from_survey_id' => $this->outline_from_survey_id === null ? null : (int) $this->outline_from_survey_id,
            'geometry' => $this->polygon,
            'captured_at' => $this->captured_at->utc()->format('Y-m-d\\TH:i:s.u\\Z'),
            'area_sqm' => (float) $this->area_sqm,
            'area_source' => 'device_reported',
            'inspector' => [
                'uuid' => $this->inspector->uuid,
                'name' => $this->inspector->name,
            ],
            'affected_area_sqm' => $this->affected_area_sqm === null ? null : (float) $this->affected_area_sqm,
            'affected_area_measurement' => $this->affectedAreaMeasurement(),
            'affected_percent' => self::affectedPercent($this->resource),
            // Retired office input, kept as history; null once never entered.
            'loss_rate_percent' => $this->pivot->loss_rate_percent === null
                ? null
                : (float) $this->pivot->loss_rate_percent,
        ];
    }

    /**
     * The phone's measured share of the plot that is affected, or null when the
     * affected area was not measured or the plot has no usable area. A plot-only
     * survey is unmeasured, never "0% affected": legacy rows that stored 0 with
     * no affected polygons read as not measured through the model's fallback.
     */
    public static function affectedPercent(FieldSurvey $survey): ?float
    {
        if ($survey->affectedAreaMeasurement() !== FieldSurvey::MEASUREMENT_MEASURED
            || $survey->affected_area_sqm === null
            || (float) $survey->area_sqm <= 0) {
            return null;
        }

        return self::percentFromAreas((float) $survey->affected_area_sqm, (float) $survey->area_sqm);
    }

    /**
     * Compute affected share of a plot keeping two decimals (matching reports.affected_portion_percent)
     * and never collapsing a positive patch (e.g. 1 m² on 10 ha) to 0.
     */
    public static function percentFromAreas(float $affectedSqm, float $plotSqm): ?float
    {
        if ($plotSqm <= 0) {
            return null;
        }

        if ($affectedSqm <= 0.0) {
            return 0.0;
        }

        $raw = min(100.0, ($affectedSqm / $plotSqm) * 100);
        if ($raw < 0.01) {
            return max(0.0001, round($raw, 4));
        }

        return round($raw, 2);
    }
}
