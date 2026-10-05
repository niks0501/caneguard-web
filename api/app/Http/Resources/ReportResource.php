<?php

namespace App\Http\Resources;

use App\Actions\Reports\AssessIdentificationGap;
use App\Actions\Reports\BuildReportCaseHistory;
use App\Actions\Reports\CalibrateReportTriage;
use App\Models\Report;
use App\Models\ReportAudit;
use App\Security\DistrictAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $triage = app(CalibrateReportTriage::class);
        $riskCalibration = $triage->handle();
        $riskBand = $triage->classify($this->resource, $riskCalibration);
        $identificationGap = app(AssessIdentificationGap::class)->handle($this->resource);

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
                    false,
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
                'model_version_recognised' => in_array($this->model_version, config('caneguard.accepted_model_versions', ['v1.0-mobilenetv2']), true),
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
                'affected_area_measurement' => $this->resource->affectedAreaMeasurement(),
                'affected_portion_percent' => $this->affected_portion_percent === null
                    ? null
                    : (float) $this->affected_portion_percent,
                'affected_portion_measurement' => $this->resource->affectedPortionMeasurement(),
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
                'location_unavailable' => $this->resource->hasLocationUnavailable(),
                'location_unavailable_reason' => $this->location_unavailable_reason,
                'gps_accuracy' => $this->gps_accuracy === null
                    ? null
                    : (float) $this->gps_accuracy,
            ],
            'reporter_observation' => [
                'mismatch_reported' => $this->mismatch_reported,
                'reporter_suspected_condition' => $this->reporter_suspected_condition,
                'reporter_observation_text' => $this->reporter_observation_text,
            ],
            'machine_facts' => $this->machineFacts(),
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
            'advisory' => $this->when(
                $this->relationLoaded('advisory'),
                fn () => $this->advisory ? [
                    'uuid' => $this->advisory->uuid,
                    'code' => $this->advisory->code,
                    'title' => $this->advisory->title,
                    'content' => $this->advisory->content,
                    'status' => $this->advisory->status,
                    'validation_provenance' => $this->advisory->validation_provenance,
                    'selected_at' => $this->advisory_selected_at?->utc()->toISOString(),
                    'delivery_state' => $this->advisory_delivery_state,
                    'delivered_at' => $this->advisory_delivered_at?->utc()->toISOString(),
                    'acknowledged_at' => $this->advisory_acknowledged_at?->utc()->toISOString(),
                ] : null,
            ),
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
                    'status' => $this->referral->consult_status,
                    'consult_status' => $this->referral->consult_status,
                    'destination' => $this->referral->destination,
                    'reference' => $this->referral->reference,
                    'tracking_code' => $request->user()?->can('review', $this->resource)
                        ? $this->referral->tracking_code
                        : null,
                    'referral_date' => $this->referral->referral_date?->format('Y-m-d'),
                    'due_date' => $this->referral->due_date?->format('Y-m-d'),
                    'expert' => $this->referral->expert ? [
                        'uuid' => $this->referral->expert->uuid,
                        'name' => $this->referral->expert->name,
                    ] : null,
                    'expert_name' => $this->referral->expert_name,
                    'expert_contact' => $this->referral->expert_contact,
                    'share_full_context' => (bool) $this->referral->share_full_context,
                    'invite_issued_at' => $this->referral->invite_issued_at?->utc()->toISOString(),
                    'invite_expires_at' => $this->referral->invite_expires_at?->utc()->toISOString(),
                    'invite_revoked_at' => $this->referral->invite_revoked_at?->utc()->toISOString(),
                    'invite_access_count' => (int) $this->referral->invite_access_count,
                    'invite_first_accessed_at' => $this->referral->invite_first_accessed_at?->utc()->toISOString(),
                    'invite_last_accessed_at' => $this->referral->invite_last_accessed_at?->utc()->toISOString(),
                    'note' => $this->referral->note,
                    'response_date' => $this->referral->response_date?->format('Y-m-d'),
                    'response_note' => $this->referral->response_note,
                    'response_finding' => $this->referral->response_finding,
                    'finding_summary' => $this->referral->finding_summary ?? $this->referral->response_note,
                    'condition_opinion' => $this->referral->condition_opinion,
                    'symptom_verdicts' => $this->referral->symptom_verdicts ?? $this->referral->symptomFindings->mapWithKeys(fn ($finding) => [$finding->symptom_key => ['verdict' => $finding->verdict, 'note' => $finding->note]])->all(),
                    'finding_details' => $this->referral->finding_details ?? $this->referral->response_finding,
                    'finding_confidence' => $this->referral->finding_confidence,
                    'finding_recommendation' => $this->referral->finding_recommendation,
                    'finding' => $this->referral->condition_opinion ?? $this->referral->finding_details ?? $this->referral->response_finding,
                    'recommendation' => $this->referral->finding_recommendation,
                    'finding_source' => $this->referral->finding_source,
                    'source' => $this->referral->finding_source,
                    'finding_recorded_by' => $this->referral->findingRecordedBy ? [
                        'uuid' => $this->referral->findingRecordedBy->uuid,
                        'name' => $this->referral->findingRecordedBy->name,
                    ] : null,
                    'finding_recorded_at' => $this->referral->finding_recorded_at?->utc()->toISOString(),
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
                    'consult_review_outcome' => $this->referral->consult_review_outcome,
                    'consult_review_note' => $this->referral->consult_review_note,
                    'consult_reviewed_by' => $this->referral->consultReviewedBy ? [
                        'uuid' => $this->referral->consultReviewedBy->uuid,
                        'name' => $this->referral->consultReviewedBy->name,
                    ] : null,
                    'consult_reviewed_at' => $this->referral->consult_reviewed_at?->utc()->toISOString(),
                ] : null,
            ),
            'consults' => $this->when(
                $this->relationLoaded('referrals'),
                fn () => $this->referrals->map(fn ($consult) => [
                    'id' => $consult->getKey(),
                    'status' => $consult->consult_status,
                    'consult_status' => $consult->consult_status,
                    'destination' => $consult->destination,
                    'reference' => $consult->reference,
                    'tracking_code' => $request->user()?->can('review', $this->resource)
                        ? $consult->tracking_code
                        : null,
                    'referral_date' => $consult->referral_date?->format('Y-m-d'),
                    'due_date' => $consult->due_date?->format('Y-m-d'),
                    'expert' => $consult->expert ? [
                        'uuid' => $consult->expert->uuid,
                        'name' => $consult->expert->name,
                    ] : null,
                    'expert_name' => $consult->expert_name,
                    'expert_contact' => $consult->expert_contact,
                    'share_full_context' => (bool) $consult->share_full_context,
                    'invite_issued_at' => $consult->invite_issued_at?->utc()->toISOString(),
                    'invite_expires_at' => $consult->invite_expires_at?->utc()->toISOString(),
                    'invite_revoked_at' => $consult->invite_revoked_at?->utc()->toISOString(),
                    'invite_access_count' => (int) $consult->invite_access_count,
                    'invite_first_accessed_at' => $consult->invite_first_accessed_at?->utc()->toISOString(),
                    'invite_last_accessed_at' => $consult->invite_last_accessed_at?->utc()->toISOString(),
                    'finding_summary' => $consult->finding_summary ?? $consult->response_note,
                    'condition_opinion' => $consult->condition_opinion,
                    'symptom_verdicts' => $consult->symptom_verdicts ?? $consult->symptomFindings->mapWithKeys(fn ($finding) => [$finding->symptom_key => ['verdict' => $finding->verdict, 'note' => $finding->note]])->all(),
                    'finding_details' => $consult->finding_details ?? $consult->response_finding,
                    'finding_confidence' => $consult->finding_confidence,
                    'finding_recommendation' => $consult->finding_recommendation,
                    'finding' => $consult->condition_opinion ?? $consult->finding_details ?? $consult->response_finding,
                    'recommendation' => $consult->finding_recommendation,
                    'finding_source' => $consult->finding_source,
                    'source' => $consult->finding_source,
                    'finding_recorded_at' => $consult->finding_recorded_at?->utc()->toISOString(),
                    'note' => $consult->note,
                    'response_date' => $consult->response_date?->format('Y-m-d'),
                    'consult_review_outcome' => $consult->consult_review_outcome,
                    'consult_review_note' => $consult->consult_review_note,
                    'consult_reviewed_by' => $consult->consultReviewedBy ? [
                        'uuid' => $consult->consultReviewedBy->uuid,
                        'name' => $consult->consultReviewedBy->name,
                    ] : null,
                    'consult_reviewed_at' => $consult->consult_reviewed_at?->utc()->toISOString(),
                ])->values(),
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
                            'uuid' => $audit->actor?->uuid,
                            'name' => $audit->actor?->name,
                        ],
                        'created_at' => $audit->created_at->utc()->toISOString(),
                        'reason' => $audit->reason,
                    ])
                    ->values(),
                'duplicate_linkages' => $this->audits
                    ->filter(fn (ReportAudit $audit): bool => $audit->field === Report::AUDIT_FIELD_CANONICAL_REPORT
                        && $audit->corrected_value !== null)
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
            'handoff_notes' => $this->handoffNotes,
            'first_reviewed_at' => $this->first_reviewed_at?->utc()->toISOString(),
            'attention_band' => $riskBand['band'],
            'attention_band_reasons' => $riskBand['reasons'],
            'identification_gap' => $identificationGap,
            'case_history' => app(BuildReportCaseHistory::class)
                ->handle($this->resource),
            'review_events' => $this->when(
                $this->relationLoaded('reviewEvents'),
                fn () => $this->reviewEvents->map(fn ($event) => [
                    'id' => $event->getKey(),
                    'actor' => $event->actor ? [
                        'uuid' => $event->actor->uuid,
                        'name' => $event->actor->name,
                    ] : null,
                    'action_taken' => $event->action_taken,
                    'authority_classified_condition' => $event->authority_classified_condition,
                    'verification_outcome' => $event->verification_outcome,
                    'notes' => $event->notes,
                    'case_state' => $event->case_state,
                    'created_at' => $event->created_at?->utc()->toISOString(),
                ])->values(),
            ),
            'version' => $this->lock_version,
            'updated_at' => $this->updated_at->utc()->toISOString(),
        ];
    }

    /**
     * Existing report evidence grouped for a compact decision-support tier.
     * No field here is an office decision or queue priority.
     *
     * @return array<string, mixed>
     */
    private function machineFacts(): array
    {
        return [
            'confidence' => $this->confidence === null ? null : (float) $this->confidence,
            'checklist_consistency' => $this->checklist_consistency,
            'quality_warnings' => $this->qualityWarnings
                ->pluck('warning_key')
                ->values(),
            'gps_accuracy' => $this->gps_accuracy === null ? null : (float) $this->gps_accuracy,
            'location_source' => $this->location_source,
            'reporter_concern' => $this->reporter_suspected_condition,
            'reporter_mismatch' => $this->mismatch_reported,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function duplicateLinkage(): array
    {
        $linkAudit = $this->relationLoaded('audits')
            ? $this->audits
                ->first(fn (ReportAudit $audit): bool => $audit->field === Report::AUDIT_FIELD_CANONICAL_REPORT
                    && $audit->corrected_value !== null)
            : null;
        $canonical = $this->relationLoaded('canonicalReport')
            ? $this->canonicalReport
            : null;
        if ($canonical !== null && ! app(DistrictAccess::class)->report(request()->user(), $canonical)) {
            $canonical = null;
        }

        $isDuplicate = $this->canonical_report_id !== null;

        return [
            'is_duplicate' => $isDuplicate,
            'canonical_case' => $isDuplicate && $canonical ? [
                'uuid' => $canonical->uuid,
                'reference_code' => $canonical->reference_code,
                'submitted_at' => $canonical->submitted_at->utc()->toISOString(),
            ] : null,
            'linked_by' => $isDuplicate && $linkAudit?->actor ? [
                'uuid' => $linkAudit->actor->uuid,
                'name' => $linkAudit->actor->name,
            ] : null,
            'linked_at' => $isDuplicate ? $linkAudit?->created_at?->utc()->toISOString() : null,
            'reason' => $isDuplicate ? $linkAudit?->reason : null,
        ];
    }
}
