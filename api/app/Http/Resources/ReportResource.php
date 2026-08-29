<?php

namespace App\Http\Resources;

use App\Models\Report;
use App\Models\ReportAudit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'identity' => [
                'uuid' => $this->uuid,
                'reference_code' => $this->reference_code,
                'client_uuid' => $this->client_uuid,
                'scan_record_client_uuid' => $this->scan_record_client_uuid,
            ],
            'reporter' => [
                'uuid' => $this->reporter->uuid,
                'name' => $this->reporter->name,
                'email' => $this->reporter->email,
            ],
            'barangay' => $this->barangay,
            'timestamps' => [
                'captured_at' => $this->captured_at->utc()->toISOString(),
                'observed_at' => $this->observed_at?->utc()->toISOString(),
                'submitted_at' => $this->submitted_at->utc()->toISOString(),
            ],
            'image' => [
                'url' => route(
                    'api.v1.reports.image',
                    ['report' => $this->uuid],
                ),
                'mime_type' => $this->image_mime_type,
                'size_bytes' => $this->image_size_bytes,
                'source_type' => $this->image_source_type,
                'source_width' => $this->source_width,
                'source_height' => $this->source_height,
            ],
            'model' => [
                'predicted_label' => $this->predicted_label,
                'confidence' => (float) $this->confidence,
                'class_scores' => $this->classScores
                    ->map(fn ($score) => [
                        'label' => $score->label,
                        'score' => (float) $score->score,
                    ])
                    ->values(),
                'model_version' => $this->model_version,
                'timings_ms' => [
                    'preprocess' => (float) $this->preprocess_ms,
                    'inference' => (float) $this->inference_ms,
                    'total' => (float) $this->total_ms,
                ],
            ],
            'observations' => [
                'symptom_keys' => $this->symptoms->pluck('symptom_key')->values(),
                'checklist_consistency' => $this->checklist_consistency,
                'reported_severity' => $this->reported_severity,
                'quality_warnings' => $this->qualityWarnings
                    ->pluck('warning_key')
                    ->values(),
                'sugarcane_variety' => $this->sugarcane_variety,
                'crop_age' => $this->crop_age,
                'cane_class' => $this->cane_class,
                'affected_area_hectares' => $this->affected_area_hectares === null
                    ? null
                    : (float) $this->affected_area_hectares,
                'affected_portion_percent' => $this->affected_portion_percent === null
                    ? null
                    : (float) $this->affected_portion_percent,
                'field_notes' => $this->field_notes,
                'farmer_or_farm_owner_name' => $this->farmer_or_farm_owner_name,
                'province' => $this->province,
                'municipality' => $this->municipality,
                'final_latitude' => $this->final_latitude === null
                    ? null
                    : (float) $this->final_latitude,
                'final_longitude' => $this->final_longitude === null
                    ? null
                    : (float) $this->final_longitude,
                'location_source' => $this->location_source,
                'gps_accuracy' => $this->gps_accuracy === null
                    ? null
                    : (float) $this->gps_accuracy,
            ],
            'reporter_observation' => [
                'mismatch_reported' => $this->mismatch_reported,
                'reporter_suspected_condition' => $this->reporter_suspected_condition,
                'reporter_observation_text' => $this->reporter_observation_text,
            ],
            'review' => [
                'status' => $this->review_status,
                'notes' => $this->review_notes,
                'authority_classified_condition' => $this->authority_classified_condition,
                'action_taken' => $this->action_taken,
                'reviewer' => $this->when($this->reviewer, fn () => [
                    'uuid' => $this->reviewer->uuid,
                    'name' => $this->reviewer->name,
                ]),
                'reviewed_at' => $this->reviewed_at?->utc()->toISOString(),
            ],
            'lifecycle' => $this->resource->lifecycleSnapshot(),
            'duplicate_linkage' => $this->duplicateLinkage(),
            'field_validation_assignment' => $this->when(
                $this->relationLoaded('fieldValidationAssignment'),
                fn () => $this->fieldValidationAssignment
                    ? (new FieldValidationAssignmentResource($this->fieldValidationAssignment))->resolve($request)
                    : null,
            ),
            'referral' => $this->when(
                $this->relationLoaded('referral'),
                fn () => $this->referral ? [
                    'destination' => $this->referral->destination,
                    'reference' => $this->referral->reference,
                    'referral_date' => $this->referral->referral_date?->format('Y-m-d'),
                    'note' => $this->referral->note,
                    'response_date' => $this->referral->response_date?->format('Y-m-d'),
                    'response_note' => $this->referral->response_note,
                    'response_finding' => $this->referral->response_finding,
                    'referred_by' => $this->referral->referredBy ? [
                        'uuid' => $this->referral->referredBy->uuid,
                        'name' => $this->referral->referredBy->name,
                    ] : null,
                    'response_recorded_by' => $this->referral->responseRecordedBy ? [
                        'uuid' => $this->referral->responseRecordedBy->uuid,
                        'name' => $this->referral->responseRecordedBy->name,
                    ] : null,
                    'office_context' => [
                        'case_state' => $this->referral->office_case_state,
                        'verification_outcome' => $this->referral->office_verification_outcome,
                        'field_validation_state' => $this->referral->office_field_validation_state,
                        'action_taken' => $this->referral->office_action_taken,
                        'authority_classified_condition' => $this->referral->office_authority_classified_condition,
                        'notes' => $this->referral->office_review_notes,
                        'reviewer' => $this->referral->officeReviewer ? [
                            'uuid' => $this->referral->officeReviewer->uuid,
                            'name' => $this->referral->officeReviewer->name,
                        ] : null,
                        'reviewed_at' => $this->referral->office_reviewed_at?->utc()->toISOString(),
                    ],
                    'response_recorded_at' => $this->referral->response_recorded_at?->utc()->toISOString(),
                ] : null,
            ),
            'audit' => [
                'metadata_corrections' => $this->audits
                    ->filter(fn (ReportAudit $audit): bool => $audit->field !== Report::AUDIT_FIELD_CANONICAL_REPORT)
                    ->map(fn (ReportAudit $audit) => [
                        'id' => $audit->getKey(),
                        'field' => $audit->field,
                        'original_value' => $audit->original_value,
                        'corrected_value' => $audit->corrected_value,
                        'actor' => [
                            'uuid' => $audit->actor->uuid,
                            'name' => $audit->actor->name,
                        ],
                        'created_at' => $audit->created_at->utc()->toISOString(),
                        'reason' => $audit->reason,
                    ])
                    ->values(),
                'duplicate_linkages' => $this->audits
                    ->filter(fn (ReportAudit $audit): bool => $audit->field === Report::AUDIT_FIELD_CANONICAL_REPORT)
                    ->map(fn (ReportAudit $audit) => [
                        'id' => $audit->getKey(),
                        'canonical_case_uuid' => $audit->corrected_value,
                        'actor' => [
                            'uuid' => $audit->actor->uuid,
                            'name' => $audit->actor->name,
                        ],
                        'created_at' => $audit->created_at->utc()->toISOString(),
                        'reason' => $audit->reason,
                    ])
                    ->values(),
            ],
            'version' => $this->lock_version,
            'updated_at' => $this->updated_at->utc()->toISOString(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function duplicateLinkage(): array
    {
        $linkAudit = $this->relationLoaded('audits')
            ? $this->audits->firstWhere('field', Report::AUDIT_FIELD_CANONICAL_REPORT)
            : null;
        $canonical = $this->relationLoaded('canonicalReport')
            ? $this->canonicalReport
            : null;

        return [
            'is_duplicate' => $this->canonical_report_id !== null,
            'canonical_case' => $canonical ? [
                'uuid' => $canonical->uuid,
                'reference_code' => $canonical->reference_code,
                'submitted_at' => $canonical->submitted_at->utc()->toISOString(),
            ] : null,
            'linked_by' => $linkAudit?->actor ? [
                'uuid' => $linkAudit->actor->uuid,
                'name' => $linkAudit->actor->name,
            ] : null,
            'linked_at' => $linkAudit?->created_at?->utc()->toISOString(),
            'reason' => $linkAudit?->reason,
        ];
    }
}
