<?php

namespace App\Http\Resources;

use App\Models\ReportAerialAnalysis;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ReportAerialAnalysis
 */
class ReportAerialAnalysisResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $enough = $this->canopy_coverage_percent
            >= (float) config('caneguard.aerial.min_canopy_coverage_percent', 10);
        $parameters = ['report' => $this->report->uuid, 'analysis' => $this->uuid];

        return [
            'uuid' => $this->uuid,
            'image_url' => route('api.v1.reports.aerial-analyses.image', $parameters, false),
            'mask_url' => route('api.v1.reports.aerial-analyses.mask', $parameters, false),
            'image_width' => $this->image_width,
            'image_height' => $this->image_height,
            'mask_width' => $this->mask_width,
            'mask_height' => $this->mask_height,
            // Shares of visible canopy in the photo, not ground area. Hidden
            // below the coverage floor rather than shown as a misleading number.
            'enough_canopy' => $enough,
            'normal_canopy_percent' => $enough ? $this->normal_canopy_percent : null,
            'abnormal_canopy_percent' => $enough ? $this->abnormal_canopy_percent : null,
            'canopy_coverage_percent' => $this->canopy_coverage_percent,
            'model_version' => $this->model_version,
            'uploaded_by' => [
                'uuid' => $this->uploader->uuid,
                'name' => $this->uploader->name,
            ],
            'created_at' => $this->created_at->utc()->toISOString(),
        ];
    }
}
