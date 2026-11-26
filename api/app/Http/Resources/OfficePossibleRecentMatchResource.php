<?php

namespace App\Http\Resources;

use App\Models\Report;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Office/web possible-match candidate.
 *
 * Extends the shared candidate additively with the context a reviewer needs to
 * compare cases. These fields identify farmers and reporters, so they exist
 * only here and never on the mobile possible-match payload.
 *
 * @mixin Report
 */
class OfficePossibleRecentMatchResource extends PossibleRecentMatchResource
{
    public const IMAGE_STATUS_AVAILABLE = 'available';

    public const IMAGE_STATUS_MISSING = 'missing';

    public const IMAGE_STATUS_NONE = 'none';

    public function toArray(Request $request): array
    {
        $payload = parent::toArray($request);
        $hasImage = $this->image_path !== null && $this->image_path !== '';

        $payload['case'] += [
            'barangay' => $this->barangay,
            'farmer_or_farm_owner_name' => $this->farmer_or_farm_owner_name,
            'submitted_by_name' => $this->reporter?->name,
            'workflow_status' => $this->resource->workflowStatus(),
            'image_url' => $hasImage
                ? route('api.v1.reports.image', ['report' => $this->uuid], false)
                : null,
            'image_status' => match (true) {
                ! $hasImage => self::IMAGE_STATUS_NONE,
                Storage::disk('local')->exists($this->image_path) => self::IMAGE_STATUS_AVAILABLE,
                default => self::IMAGE_STATUS_MISSING,
            },
        ];

        return $payload;
    }
}
