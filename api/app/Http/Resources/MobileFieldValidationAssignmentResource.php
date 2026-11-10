<?php

namespace App\Http\Resources;

use App\Contracts\MobileFieldValidationAssignmentContract;
use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Support\MobilePreviousVisit;
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
            ] + (self::caseProjection($assignment) ?? []),
            'previous_visit' => self::previousVisitPayload($assignment),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function previousVisitPayload(FieldValidationAssignment $assignment): ?array
    {
        // The feed version digests the shared payload, so the serializer and
        // the digest must never drift apart.
        $payload = MobilePreviousVisit::payload($assignment);
        if ($payload === null) {
            return null;
        }

        // Field rows keep the exact legacy payload; only office-born cases
        // carry a fetchable reference to the last visit's photo.
        $completion = MobilePreviousVisit::resolve($assignment)?->completion;
        if ($completion !== null && $assignment->report->origin === Report::ORIGIN_OFFICE) {
            $payload['photo'] = $completion->fresh_photo_path === null ? null : [
                'url' => route('api.v1.mobile.assignments.previous-evidence-photo', [
                    'assignment' => $assignment->uuid,
                ], false),
                'content_type' => $completion->fresh_photo_mime_type,
                'bytes' => $completion->fresh_photo_size_bytes === null
                    ? null
                    : (int) $completion->fresh_photo_size_bytes,
            ];
        }

        return $payload;
    }

    /**
     * Optional projection that lets the phone treat an office-born case as
     * its own kind. Field-born rows never carry these keys, so their wire
     * shape stays byte-identical to the legacy feed. The feed version digests
     * the whole returned array, so the serializer and the digest share one
     * definition.
     *
     * @return array<string, mixed>|null
     */
    public static function caseProjection(FieldValidationAssignment $assignment): ?array
    {
        $report = $assignment->report;
        if ($report->origin !== Report::ORIGIN_OFFICE) {
            return null;
        }

        $lifecycle = $report->lifecycleSnapshot();

        return [
            'origin' => Report::ORIGIN_OFFICE,
            'version' => (int) $report->lock_version,
            'status' => [
                'workflow_status' => $report->workflowStatus(),
                'case_state' => $lifecycle['case_state'],
                'review_status' => $report->review_status,
                'updated_at' => $report->updated_at->utc()->toISOString(),
            ],
            'reporter_concern' => [
                'suspected_condition' => $report->reporter_suspected_condition,
                'observation_text' => $report->reporter_observation_text === null
                    ? null
                    : mb_substr($report->reporter_observation_text, 0, 1000),
            ],
            'photo' => $report->image_path === null || $report->image_path === '' ? null : [
                'url' => route('api.v1.mobile.assignments.report-photo', [
                    'assignment' => $assignment->uuid,
                ], false),
                'content_type' => $report->image_mime_type,
                'bytes' => (int) $report->image_size_bytes,
            ],
        ];
    }
}
