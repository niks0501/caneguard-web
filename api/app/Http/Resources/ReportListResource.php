<?php

namespace App\Http\Resources;

use App\Actions\Reports\AssessIdentificationGap;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReportListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'reference_code' => $this->reference_code,
            'reporter' => [
                'uuid' => $this->reporter->uuid,
                'name' => $this->reporter->name,
            ],
            'barangay' => $this->barangay,
            'farmer_or_farm_owner_name' => $this->farmer_or_farm_owner_name,
            // Until a farm entity is introduced, the register uses the
            // reporter's free-text value and falls back to the known barangay.
            'farm_reference' => $this->farmer_or_farm_owner_name ?: $this->barangay,
            'province' => $this->province,
            'municipality' => $this->municipality,
            'observed_at' => $this->observed_at?->utc()->toISOString(),
            'captured_at' => $this->captured_at->utc()->toISOString(),
            'submitted_at' => $this->submitted_at->utc()->toISOString(),
            'first_reviewed_at' => $this->first_reviewed_at?->utc()->toISOString(),
            'predicted_label' => $this->predicted_label,
            'review_status' => $this->review_status,
            'lifecycle' => $this->resource->lifecycleSnapshot(),
            'authority_classified_condition' => $this->authority_classified_condition,
            'reporter_suspected_condition' => $this->reporter_suspected_condition,
            'reporter_observation_text' => $this->reporter_observation_text,
            'action_taken' => $this->action_taken,
            'field_validation' => $this->fieldValidationSummary(),
            'latest_validation' => $this->latestValidationSummary(),
            'location_unavailable' => $this->resource->hasLocationUnavailable(),
            'location_unavailable_reason' => $this->location_unavailable_reason,
            'affected_area_measurement' => $this->resource->affectedAreaMeasurement(),
            'affected_portion_measurement' => $this->resource->affectedPortionMeasurement(),
            'follow_up' => [
                'due_on' => $this->fieldValidationAssignment?->target_visit_date?->format('Y-m-d'),
                'overdue' => $this->fieldValidationAssignment?->target_visit_date !== null
                    && $this->fieldValidationAssignment->target_visit_date
                        ->lt(now()->startOfDay()),
            ],
            'mismatch_reported' => $this->mismatch_reported,
            'machine_facts' => $this->machineFacts(),
            'attention_band' => $this->attention_band,
            'attention_band_reasons' => $this->attention_band_reasons ?? [],
            'identification_gap' => app(AssessIdentificationGap::class)->handle($this->resource),
            'expert_consult' => $this->activeConsultSummary(),
            'referral' => $this->activeConsultSummary(),
            'version' => $this->lock_version,
            'image_url' => route(
                'api.v1.reports.image',
                ['report' => $this->uuid],
            ),
        ];
    }

    /**
     * Keep the active consult's clock available in every office queue and the
     * expert queue without creating a second operational queue.
     *
     * @return array<string, mixed>|null
     */
    private function activeConsultSummary(): ?array
    {
        $consult = $this->resource->relationLoaded('referral')
            ? $this->referral
            : null;

        if (! $consult || ! $consult->isActive()) {
            return null;
        }

        $today = now()->startOfDay();
        $daysUntilDue = $consult->due_date === null
            ? null
            : $today->diffInDays($consult->due_date->copy()->startOfDay(), false);

        return [
            'id' => $consult->getKey(),
            'status' => $consult->consult_status,
            'referral_date' => $consult->referral_date?->format('Y-m-d'),
            'due_date' => $consult->due_date?->format('Y-m-d'),
            'expert' => $consult->expert ? [
                'uuid' => $consult->expert->uuid,
                'name' => $consult->expert->name,
            ] : null,
            'days_until_due' => $daysUntilDue,
            'overdue' => $daysUntilDue !== null && $daysUntilDue < 0,
            'age_label' => $daysUntilDue === null
                ? 'No due date'
                : ($daysUntilDue < 0
                    ? 'Overdue'
                    : ($daysUntilDue === 0 ? 'Due today' : 'Due in '.$daysUntilDue.' '.($daysUntilDue === 1 ? 'day' : 'days'))),
        ];
    }

    /**
     * Machine facts are existing submitted fields presented together for queue
     * scanning. They are descriptive only and never define queue priority.
     *
     * @return array<string, mixed>
     */
    private function machineFacts(): array
    {
        return [
            'checklist_consistency' => $this->checklist_consistency,
            'quality_warnings' => $this->resource->relationLoaded('qualityWarnings')
                ? $this->qualityWarnings->pluck('warning_key')->values()->all()
                : [],
            'gps_accuracy' => $this->gps_accuracy === null ? null : (float) $this->gps_accuracy,
            'location_source' => $this->location_source,
            'reporter_concern' => $this->reporter_suspected_condition,
            'reporter_mismatch' => $this->mismatch_reported,
        ];
    }

    /**
     * Keep target dates and assignment state together so register views do not
     * need to infer a visit from the legacy review status.
     *
     * @return array<string, mixed>
     */
    private function fieldValidationSummary(): array
    {
        $assignment = $this->resource->relationLoaded('fieldValidationAssignment')
            ? $this->fieldValidationAssignment
            : null;

        return [
            'state' => $this->resource->lifecycleSnapshot()['field_validation_state'],
            'assignment_uuid' => $assignment?->uuid,
            'target_visit_date' => $assignment?->target_visit_date?->format('Y-m-d'),
            'assignee' => $assignment?->assignee ? [
                'uuid' => $assignment->assignee->uuid,
                'name' => $assignment->assignee->name,
            ] : null,
            'assigned_by' => $assignment?->assignedBy ? [
                'uuid' => $assignment->assignedBy->uuid,
                'name' => $assignment->assignedBy->name,
            ] : null,
            'activated_at' => $assignment?->activated_at?->utc()->toISOString(),
            'updated_at' => $assignment?->updated_at?->utc()->toISOString(),
        ];
    }

    /**
     * A single completion is currently allowed per case. Keep the response
     * named "latest" so a future repeat-visit migration has an explicit seam.
     *
     * @return array<string, mixed>|null
     */
    private function latestValidationSummary(): ?array
    {
        $assignment = $this->resource->relationLoaded('fieldValidationAssignment')
            ? $this->fieldValidationAssignment
            : null;
        $completion = $assignment?->relationLoaded('completion')
            ? $assignment->completion
            : null;

        if (! $completion) {
            return null;
        }

        return [
            'visited_at' => $completion->visited_at?->utc()->toISOString(),
            'field_observation' => $completion->field_observation,
            'finding' => $completion->field_finding,
            'action_taken' => $completion->action_taken,
            'follow_up_outcome' => $completion->follow_up_outcome,
            'assignee' => $assignment?->assignee ? [
                'uuid' => $assignment->assignee->uuid,
                'name' => $assignment->assignee->name,
            ] : null,
            'fresh_photo' => [
                'available' => $completion->fresh_photo_path !== null,
                'url' => $completion->fresh_photo_path !== null
                    ? route('api.v1.reports.validation-photo', ['report' => $this->uuid])
                    : null,
            ],
        ];
    }
}
