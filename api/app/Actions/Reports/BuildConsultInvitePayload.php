<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\ReportReferral;
use Illuminate\Support\Facades\URL;

class BuildConsultInvitePayload
{
    /**
     * Build the deliberately narrow packet sent to an unsigned-in external
     * adviser. Identity and exact coordinates are added only when the office
     * opted into full context for this specific consult.
     *
     * @return array<string, mixed>
     */
    public function handle(Report $report, ReportReferral $consult, string $token): array
    {
        $symptomKeys = $report->symptoms->pluck('symptom_key')->values()->all();
        $location = [
            'barangay' => $report->barangay,
            'municipality' => $report->municipality,
            'province' => $report->province,
        ];
        $case = [
            'uuid' => $report->uuid,
            'reference_code' => $report->reference_code,
            'submitted_at' => $report->submitted_at->utc()->toISOString(),
            'photo_url' => $this->photoUrl($token, $consult),
            'reporter_observations' => [
                'symptom_keys' => $symptomKeys,
                'reporter_observation_text' => $report->reporter_observation_text,
                'field_notes' => $report->field_notes,
                'reporter_suspected_condition' => $report->reporter_suspected_condition,
                'checklist_consistency' => $report->checklist_consistency,
                'reported_severity' => $report->reported_severity,
            ],
            'ai_possible_condition' => [
                'label' => $report->predicted_label,
                'decision_support_label' => 'Decision-support only. This is not a diagnosis.',
            ],
            'location' => $location,
            'affected_area' => [
                'value' => $report->affected_area_hectares === null
                    ? null
                    : (float) $report->affected_area_hectares,
                'unit' => 'hectares',
                'measurement' => $report->affectedAreaMeasurement(),
            ],
            'affected_portion' => [
                'value' => $report->affected_portion_percent === null
                    ? null
                    : (float) $report->affected_portion_percent,
                'unit' => 'percent',
                'measurement' => $report->affectedPortionMeasurement(),
            ],
        ];

        $payload = [
            'case' => $case,
            'reference_code' => $report->reference_code,
            'submitted_at' => $case['submitted_at'],
            'photo_url' => $case['photo_url'],
            'reporter_observations' => $case['reporter_observations'],
            'ai_possible_condition' => $case['ai_possible_condition'],
            'location' => $location,
            'affected_area' => $case['affected_area'],
            'affected_portion' => $case['affected_portion'],
            'question' => $consult->note,
            'due_date' => $consult->due_date?->format('Y-m-d'),
            'share_full_context' => (bool) $consult->share_full_context,
            'consult' => [
                'reference' => $consult->reference,
                'referral_date' => $consult->referral_date?->format('Y-m-d'),
                'due_date' => $consult->due_date?->format('Y-m-d'),
                'question' => $consult->note,
            ],
        ];

        if ($consult->share_full_context) {
            $payload['farmer_or_farm_owner_name'] = $report->farmer_or_farm_owner_name;
            $payload['case']['farmer_or_farm_owner_name'] = $report->farmer_or_farm_owner_name;
            $payload['location']['latitude'] = $report->final_latitude === null
                ? null
                : (float) $report->final_latitude;
            $payload['location']['longitude'] = $report->final_longitude === null
                ? null
                : (float) $report->final_longitude;
            $payload['case']['location']['latitude'] = $payload['location']['latitude'];
            $payload['case']['location']['longitude'] = $payload['location']['longitude'];
        }

        return $payload;
    }

    public function photoUrl(string $token, ReportReferral $consult): string
    {
        return URL::temporarySignedRoute(
            'api.v1.consult-invites.image',
            $consult->invite_expires_at,
            ['token' => $token],
        );
    }
}
