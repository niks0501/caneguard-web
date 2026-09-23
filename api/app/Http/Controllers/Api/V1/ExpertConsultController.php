<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Report;
use App\Models\ReportReferral;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExpertConsultController extends Controller
{
    public function __invoke(Request $request, Report $report): JsonResponse
    {
        $this->authorize('view', $report);

        $user = $request->user();
        if ($user?->isExpert()) {
            $accessCutoff = now()->subDays(
                (int) config('caneguard.expert_consult_access_days', 14),
            );
            $consult = $report->referrals()
                ->where('expert_id', $user->getKey())
                ->whereIn('consult_status', ReportReferral::activeStatuses())
                ->latest('id')
                ->first()
                ?? $report->referrals()
                    ->where('expert_id', $user->getKey())
                    ->where('consult_status', ReportReferral::STATUS_COMPLETED)
                    ->whereNotNull('finding_recorded_at')
                    ->where('finding_recorded_at', '>=', $accessCutoff)
                    ->latest('id')
                    ->first();
            abort_unless($consult !== null, 403);
        } else {
            $consult = $report->referrals()
                ->whereIn('consult_status', ReportReferral::activeStatuses())
                ->latest('id')
                ->first()
                ?? $report->referrals()->latest('id')->first();
        }

        abort_unless($consult !== null, 404, 'No expert consult is recorded for this case.');

        $report->load([
            'reporter',
            'symptoms',
            'classScores',
            'qualityWarnings',
            'referrals' => fn ($query) => $query
                ->where('consult_status', ReportReferral::STATUS_COMPLETED)
                ->where('id', '!=', $consult->getKey())
                ->with(['symptomFindings', 'expert'])
                ->orderByDesc('id'),
        ]);
        $consult->load(['expert', 'referredBy', 'symptomFindings']);

        return response()->json([
            'data' => $this->payload($report, $consult),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Report $report, ReportReferral $consult): array
    {
        $symptomKeys = $report->symptoms->pluck('symptom_key')->values()->all();
        $priorConsults = $report->referrals
            ->map(fn (ReportReferral $prior): array => $this->consultPayload($prior))
            ->values()
            ->all();
        $evidence = [
            'symptom_keys' => $symptomKeys,
            'reporter_observation_text' => $report->reporter_observation_text,
            'field_notes' => $report->field_notes,
            'reporter_suspected_condition' => $report->reporter_suspected_condition,
            'checklist_consistency' => $report->checklist_consistency,
            'reported_severity' => $report->reported_severity,
            'quality_warnings' => $report->qualityWarnings->pluck('warning_key')->values()->all(),
        ];
        $location = [
            'barangay' => $report->barangay,
            'municipality' => $report->municipality,
            'province' => $report->province,
        ];
        if ($consult->share_full_context) {
            $location['latitude'] = $report->final_latitude === null
                ? null
                : (float) $report->final_latitude;
            $location['longitude'] = $report->final_longitude === null
                ? null
                : (float) $report->final_longitude;
        }
        $measurements = [
            'affected_area_hectares' => $report->affected_area_hectares === null
                ? null
                : (float) $report->affected_area_hectares,
            'affected_area_measurement' => $report->affectedAreaMeasurement(),
            'affected_portion_percent' => $report->affected_portion_percent === null
                ? null
                : (float) $report->affected_portion_percent,
            'affected_portion_measurement' => $report->affectedPortionMeasurement(),
        ];
        $officeContext = [
            'case_state' => $consult->office_case_state,
            'verification_outcome' => $consult->office_verification_outcome,
            'field_validation_state' => $consult->office_field_validation_state,
            'action_taken' => $consult->office_action_taken,
            'authority_classified_condition' => $consult->office_authority_classified_condition,
            'notes' => $consult->office_review_notes,
            'reviewed_at' => $consult->office_reviewed_at?->utc()->toISOString(),
        ];

        $case = [
            'uuid' => $report->uuid,
            'reference_code' => $report->reference_code,
            'submitted_at' => $report->submitted_at->utc()->toISOString(),
            'photo_url' => route('api.v1.reports.image', ['report' => $report->uuid]),
            'reporter_observations' => $evidence,
            'reporter_suspected_condition' => $report->reporter_suspected_condition,
            'ai_possible_condition' => [
                'label' => $report->predicted_label,
                'predicted_label' => $report->predicted_label,
                'decision_support_label' => 'Decision-support only. This is not a diagnosis.',
            ],
            'location' => $location,
            'measurements' => $measurements,
        ];
        if ($consult->share_full_context) {
            $case['farmer_or_farm_owner_name'] = $report->farmer_or_farm_owner_name;
        }

        $payload = [
            'case' => $case,
            // These top-level aliases keep the packet easy to consume for a
            // narrow workspace without making the office form reusable here.
            'reference_code' => $report->reference_code,
            'submitted_at' => $report->submitted_at->utc()->toISOString(),
            'photo_url' => route('api.v1.reports.image', ['report' => $report->uuid]),
            'reporter_observations' => $evidence,
            'reporter_suspected_condition' => $report->reporter_suspected_condition,
            'symptom_keys' => $symptomKeys,
            'ai_possible_condition' => [
                'label' => $report->predicted_label,
                'predicted_label' => $report->predicted_label,
                'decision_support_label' => 'Decision-support only. This is not a diagnosis.',
            ],
            'location' => $location,
            'affected_area' => [
                'value' => $measurements['affected_area_hectares'],
                'unit' => 'hectares',
                'measurement' => $measurements['affected_area_measurement'],
            ],
            'affected_portion' => [
                'value' => $measurements['affected_portion_percent'],
                'unit' => 'percent',
                'measurement' => $measurements['affected_portion_measurement'],
            ],
            'office_context' => $officeContext,
            'consult' => $this->consultPayload($consult),
            'due_date' => $consult->due_date?->format('Y-m-d'),
            'question' => $consult->note,
            'prior_consults' => $priorConsults,
            'version' => $report->lock_version,
            'share_full_context' => (bool) $consult->share_full_context,
        ];
        if ($consult->share_full_context) {
            $payload['farmer_or_farm_owner_name'] = $report->farmer_or_farm_owner_name;
        }

        return $payload;
    }

    /** @return array<string, mixed> */
    private function consultPayload(ReportReferral $consult): array
    {
        $symptomVerdicts = $consult->symptomFindings
            ->mapWithKeys(fn ($finding): array => [
                $finding->symptom_key => [
                    'verdict' => $finding->verdict,
                    'note' => $finding->note,
                ],
            ])
            ->all();
        if ($symptomVerdicts === [] && is_array($consult->symptom_verdicts)) {
            $symptomVerdicts = $consult->symptom_verdicts;
        }

        return [
            'id' => $consult->getKey(),
            'status' => $consult->consult_status,
            'reference' => $consult->reference,
            'referral_date' => $consult->referral_date?->format('Y-m-d'),
            'due_date' => $consult->due_date?->format('Y-m-d'),
            'question' => $consult->note,
            'expert' => $consult->expert ? [
                'uuid' => $consult->expert->uuid,
                'name' => $consult->expert->name,
            ] : null,
            'condition_opinion' => $consult->condition_opinion,
            'basis' => $consult->finding_details,
            'finding_details' => $consult->finding_details,
            'confidence' => $consult->finding_confidence,
            'recommendation' => $consult->finding_recommendation,
            'symptom_verdicts' => $symptomVerdicts,
            'response_date' => $consult->response_date?->format('Y-m-d'),
            'finding_source' => $consult->finding_source,
            'finding_recorded_at' => $consult->finding_recorded_at?->utc()->toISOString(),
        ];
    }
}
