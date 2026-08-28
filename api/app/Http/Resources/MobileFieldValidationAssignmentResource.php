<?php

namespace App\Http\Resources;

use App\Contracts\MobileFieldValidationAssignmentContract;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MobileFieldValidationAssignmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // Loading the artifact here keeps the public serializer tied to the
        // same contract that the Web and Mobile gates validate.
        MobileFieldValidationAssignmentContract::definition();
        $report = $this->report;
        $assignment = $this->resource;
        $lifecycle = $report->lifecycleSnapshot();

        return [
            'uuid' => $assignment->uuid,
            'report_uuid' => $report->uuid,
            'report_client_uuid' => $report->client_uuid,
            'reference_code' => $report->reference_code,
            'submitter' => [
                'uuid' => $report->reporter->uuid,
                'name' => $report->reporter->name,
            ],
            'assignee' => [
                'uuid' => $assignment->assignee->uuid,
                'name' => $assignment->assignee->name,
            ],
            'submitter_is_assignee' => (string) $report->reporter_id === (string) $assignment->assignee_id,
            'target_visit_date' => $assignment->target_visit_date?->format('Y-m-d'),
            'field_validation_state' => $lifecycle['field_validation_state'],
            'assigned_at' => $assignment->activated_at->utc()->toISOString(),
            'updated_at' => $assignment->updated_at->utc()->toISOString(),
            'case' => [
                'barangay' => $report->barangay,
                'province' => $report->province,
                'municipality' => $report->municipality,
                'farmer_or_farm_owner_name' => $report->farmer_or_farm_owner_name,
                'affected_area_hectares' => $report->affected_area_hectares === null
                    ? null
                    : (float) $report->affected_area_hectares,
                'affected_portion_percent' => $report->affected_portion_percent === null
                    ? null
                    : (float) $report->affected_portion_percent,
                'captured_at' => $report->captured_at->utc()->toISOString(),
                'observed_at' => $report->observed_at?->utc()->toISOString(),
                'submitted_at' => $report->submitted_at->utc()->toISOString(),
                'predicted_label' => $report->predicted_label,
                'confidence' => (float) $report->confidence,
            ],
        ];
    }
}
