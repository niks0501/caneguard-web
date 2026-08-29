<?php

namespace App\Http\Resources;

use App\Models\Report;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** @mixin Report */
class ReferralSummaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $report = $this->resource;
        $referral = $report->referral;
        $lifecycle = $report->lifecycleSnapshot();
        $primaryImageAvailable = Storage::disk('local')->exists($report->image_path);

        return [
            'case' => [
                'uuid' => $report->uuid,
                'reference_code' => $report->reference_code,
            ],
            'dates' => [
                'captured_at' => $report->captured_at->utc()->toISOString(),
                'observed_at' => $report->observed_at?->utc()->toISOString(),
                'submitted_at' => $report->submitted_at->utc()->toISOString(),
                'reviewed_at' => $report->reviewed_at?->utc()->toISOString(),
                'referral_date' => $referral->referral_date?->format('Y-m-d'),
                'response_date' => $referral->response_date?->format('Y-m-d'),
            ],
            'farmer_or_farm_reference' => $report->farmer_or_farm_owner_name,
            'farmer_or_farm_owner_name' => $report->farmer_or_farm_owner_name,
            'reporter' => [
                'uuid' => $report->reporter->uuid,
                'name' => $report->reporter->name,
            ],
            'location' => [
                'barangay' => $report->barangay,
                'municipality' => $report->municipality,
                'province' => $report->province,
                'latitude' => $report->final_latitude === null
                    ? null
                    : (float) $report->final_latitude,
                'longitude' => $report->final_longitude === null
                    ? null
                    : (float) $report->final_longitude,
                'source' => $report->location_source,
                'gps_accuracy' => $report->gps_accuracy === null
                    ? null
                    : (float) $report->gps_accuracy,
            ],
            'affected' => [
                'area_hectares' => $report->affected_area_hectares === null
                    ? null
                    : (float) $report->affected_area_hectares,
                'portion_percent' => $report->affected_portion_percent === null
                    ? null
                    : (float) $report->affected_portion_percent,
            ],
            'primary_evidence' => [
                'url' => route('api.v1.reports.image', ['report' => $report->uuid]),
                'available' => $primaryImageAvailable,
                'mime_type' => $report->image_mime_type,
                'source_type' => $report->image_source_type,
                'width' => $report->source_width,
                'height' => $report->source_height,
            ],
            'reporter_observations' => [
                'mismatch_reported' => $report->mismatch_reported,
                'suspected_condition' => $report->reporter_suspected_condition,
                'observation_text' => $report->reporter_observation_text,
                'field_notes' => $report->field_notes,
                'symptom_keys' => $report->symptoms->pluck('symptom_key')->values()->all(),
            ],
            'possible_ai_result' => [
                'label' => $report->predicted_label,
                'confidence' => (float) $report->confidence,
                'role' => 'decision_support_only',
                'label_text' => 'Possible '.str_replace('_', ' ', $report->predicted_label),
                'model_version' => $report->model_version,
            ],
            'office_context' => [
                'case_state' => $referral->office_case_state,
                'verification_outcome' => $referral->office_verification_outcome,
                'field_validation_state' => $referral->office_field_validation_state,
                'action_taken' => $referral->office_action_taken,
                'authority_classified_condition' => $referral->office_authority_classified_condition,
                'notes' => $referral->office_review_notes,
                'reviewer' => $referral->officeReviewer ? [
                    'uuid' => $referral->officeReviewer->uuid,
                    'name' => $referral->officeReviewer->name,
                ] : null,
                'reviewed_at' => $referral->office_reviewed_at?->utc()->toISOString(),
            ],
            'referral' => [
                'destination' => $referral->destination,
                'reference' => $referral->reference,
                'referral_date' => $referral->referral_date?->format('Y-m-d'),
                'note' => $referral->note,
                'response_date' => $referral->response_date?->format('Y-m-d'),
                'response_note' => $referral->response_note,
                'response_finding' => $referral->response_finding,
                'state' => $lifecycle['referral_state'],
            ],
        ];
    }
}
