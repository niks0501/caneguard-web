<?php

namespace Database\Seeders;

use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Seed the month-spanning records used by the local dashboard overview.
 *
 * The records are deliberately ordinary synthetic office reports: they share
 * one geography, use stable fictional names, and exercise the operational
 * states that the overview summarizes. This seeder is add-only and is called
 * by DatabaseSeeder so a normal local reset gets the complete dashboard.
 */
class DashboardReportSeeder extends Seeder
{
    /**
     * @var array<int, string>
     */
    public const REPORT_REFERENCES = [
        'BGO-20260905-0715',
        'BGO-20260914-0830',
        'BGO-20260925-0645',
        'BGO-20261003-0740',
        'BGO-20261011-0910',
        'BGO-20261018-0630',
        'BGO-20261024-0815',
        'BGO-20261030-0705',
        'BGO-20261106-0840',
        'BGO-20261115-0720',
        'BGO-20261124-0900',
    ];

    public function run(): void
    {
        $reporter = User::query()
            ->where('email', 'field@caneguard.test')
            ->firstOrFail();
        $reviewer = User::query()
            ->where('email', 'mao@caneguard.test')
            ->firstOrFail();
        $image = file_get_contents(
            database_path('seeders/assets/synthetic-sugarcane-rust.png'),
        );

        if (! is_string($image)) {
            throw new RuntimeException('The report image asset is invalid.');
        }

        $reports = [];
        foreach ($this->reportDefinitions($reviewer) as $referenceCode => $attributes) {
            $reports[$referenceCode] = $this->seedReport(
                $referenceCode,
                $attributes,
                $reporter,
                $image,
            );
        }

        $this->seedExpertConsults($reports, $reviewer);
    }

    /**
     * @return array<int, string>
     */
    public static function reportReferences(): array
    {
        return self::REPORT_REFERENCES;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function reportDefinitions(User $reviewer): array
    {
        return [
            'BGO-20260905-0715' => $this->attributes(
                '5e1af3d1-6f7d-4bc2-9e48-2f86a3da0a11',
                '0d09f4e1-0de7-4ed5-a4cc-8f09e13b1a01',
                'Abuanan',
                'Maribel Cordero',
                Report::LABEL_RUST,
                0.78,
                0.85,
                '2026-09-05 07:15:00',
                Report::STATUS_SUBMITTED_UNVERIFIED,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                Report::REFERRAL_STATE_NOT_REFERRED,
                null,
            ),
            'BGO-20260914-0830' => $this->attributes(
                '2a5f2d0c-45b0-4d1c-9c2e-819ad98ef012',
                'b8ddf31f-6348-4a2f-8d77-8a73e6f1b102',
                'Dulao',
                'Esteban Lacuesta',
                Report::LABEL_SMUT,
                0.86,
                1.2,
                '2026-09-14 08:30:00',
                Report::STATUS_FOR_FIELD_VALIDATION,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_ASSIGNED,
                Report::REFERRAL_STATE_NOT_REFERRED,
                Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                $reviewer,
                '2026-09-15 10:30:00',
            ),
            'BGO-20260925-0645' => $this->attributes(
                '7e0d4f37-6a08-42ed-9814-2cb6f5a4c013',
                '7abf2148-d89a-44d7-ae0f-18fa23d0c103',
                'Mailum',
                'Rosalinda Ybañez',
                Report::LABEL_MOSAIC,
                0.81,
                0.65,
                '2026-09-25 06:45:00',
                Report::STATUS_VERIFIED_BY_STAFF,
                Report::CASE_STATE_CLOSED,
                Report::VERIFICATION_OUTCOME_VERIFIED,
                Report::FIELD_VALIDATION_STATE_COMPLETED,
                Report::REFERRAL_STATE_NOT_REFERRED,
                Report::ACTION_NO_FURTHER_ACTION_REQUIRED,
                $reviewer,
                '2026-09-26 09:15:00',
            ),
            'BGO-20261003-0740' => $this->attributes(
                '49cb6d1e-2a45-48b7-9f60-3e0a7c5d1014',
                'e8a1d6f2-2405-49a5-b7f7-23b1d9ce4104',
                'Lag-asan',
                'Carmela Natividad',
                Report::LABEL_RUST,
                0.83,
                2.4,
                '2026-10-03 07:40:00',
                Report::STATUS_SUBMITTED_UNVERIFIED,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                Report::REFERRAL_STATE_NOT_REFERRED,
                null,
            ),
            'BGO-20261011-0910' => $this->attributes(
                '0cb2f8e3-7c2a-4f5f-a941-5a0e6d2b2015',
                '3ffb3b70-1d8d-4d2c-b3a0-11a4bcf0d205',
                'Poblacion',
                'Mateo Villareal',
                Report::LABEL_SMUT,
                0.74,
                1.85,
                '2026-10-11 09:10:00',
                Report::STATUS_FOR_FIELD_VALIDATION,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_ASSIGNED,
                Report::REFERRAL_STATE_NOT_REFERRED,
                Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                $reviewer,
                '2026-10-12 13:10:00',
            ),
            'BGO-20261018-0630' => $this->attributes(
                'f2b3d6e4-8a1f-4e9a-bd62-6c4e7a3f3016',
                '9f6c0b4e-7e41-4f0f-9aa8-0a5b21d6e306',
                'Taloc',
                'Lourdes Manansala',
                Report::LABEL_MOSAIC,
                0.9,
                0.95,
                '2026-10-18 06:30:00',
                Report::STATUS_VERIFIED_BY_STAFF,
                Report::CASE_STATE_CLOSED,
                Report::VERIFICATION_OUTCOME_VERIFIED,
                Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
                Report::REFERRAL_STATE_NOT_REFERRED,
                Report::ACTION_ADVISORY_PROVIDED,
                $reviewer,
                '2026-10-19 08:30:00',
            ),
            'BGO-20261024-0815' => $this->attributes(
                'a4e7c0f2-3b9d-4d8a-8f16-7c2e5b9a4017',
                '4c0d8e2a-70c9-4876-9ef4-3c2b1a7d4107',
                'Malingin',
                'Benilda Soriano',
                Report::LABEL_HEALTHY,
                0.95,
                0.42,
                '2026-10-24 08:15:00',
                Report::STATUS_UNABLE_TO_VERIFY,
                Report::CASE_STATE_CLOSED,
                Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY,
                Report::FIELD_VALIDATION_STATE_COMPLETED,
                Report::REFERRAL_STATE_NOT_REFERRED,
                Report::ACTION_NO_FURTHER_ACTION_REQUIRED,
                $reviewer,
                '2026-10-25 11:45:00',
            ),
            'BGO-20261030-0705' => $this->attributes(
                '6f9a1d3c-5e7b-4a2f-8d90-1c3b6e8f5018',
                'd2b4f8e0-6a32-4d9c-9f73-5b1e0c7a5108',
                'Napoles',
                'Omar de la Cruz',
                Report::LABEL_RUST,
                0.88,
                1.6,
                '2026-10-30 07:05:00',
                Report::STATUS_RESOLVED,
                Report::CASE_STATE_CLOSED,
                Report::VERIFICATION_OUTCOME_VERIFIED,
                Report::FIELD_VALIDATION_STATE_COMPLETED,
                Report::REFERRAL_STATE_NOT_REFERRED,
                Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                $reviewer,
                '2026-10-31 10:05:00',
            ),
            'BGO-20261106-0840' => $this->attributes(
                '1e5a8c3d-7f2b-4d90-a6e1-9c4b7f2d6019',
                '8a3f1c6e-2d9b-4e7a-b5f0-6c1e8d4a6109',
                'Sagasa',
                'Felisa Monteclaro',
                Report::LABEL_SMUT,
                0.7,
                1.1,
                '2026-11-06 08:40:00',
                Report::STATUS_SUBMITTED_UNVERIFIED,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                Report::REFERRAL_STATE_NOT_REFERRED,
                Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
            ),
            'BGO-20261115-0720' => $this->attributes(
                'b7c4e1f9-3a6d-4f80-9e2b-5c7a1d8f7020',
                'f1d6b8a2-4e9c-4073-a5f0-2b7d9c6e7120',
                'Tinongan',
                'Nicanora Salcedo',
                Report::LABEL_MOSAIC,
                0.77,
                2.15,
                '2026-11-15 07:20:00',
                Report::STATUS_FOR_FIELD_VALIDATION,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_ASSIGNED,
                Report::REFERRAL_STATE_NOT_REFERRED,
                Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                $reviewer,
                '2026-11-16 09:20:00',
            ),
            'BGO-20261124-0900' => $this->attributes(
                'c2f5a8d1-6e3b-4f90-b7a2-1d9c5e8f8021',
                '5e0a3c7f-1d8b-4f6e-a2c9-7b4d0e5f8121',
                'Balingasag',
                'Ramon Gaviola',
                Report::LABEL_HEALTHY,
                0.93,
                0.55,
                '2026-11-24 09:00:00',
                Report::STATUS_VERIFIED_BY_STAFF,
                Report::CASE_STATE_CLOSED,
                Report::VERIFICATION_OUTCOME_VERIFIED,
                Report::FIELD_VALIDATION_STATE_COMPLETED,
                Report::REFERRAL_STATE_NOT_REFERRED,
                Report::ACTION_ADVISORY_PROVIDED,
                $reviewer,
                '2026-11-25 12:00:00',
            ),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function attributes(
        string $uuid,
        string $clientUuid,
        string $barangay,
        string $farmOwner,
        string $label,
        float $confidence,
        float $affectedArea,
        string $submittedAt,
        string $reviewStatus,
        string $caseState,
        string $verificationOutcome,
        string $fieldValidationState,
        string $referralState,
        ?string $actionTaken,
        ?User $reviewer = null,
        ?string $reviewedAt = null,
    ): array {
        return [
            'uuid' => $uuid,
            'client_uuid' => $clientUuid,
            'barangay' => $barangay,
            'farmer_or_farm_owner_name' => $farmOwner,
            'province' => 'Negros Occidental',
            'municipality' => 'Bago',
            'final_latitude' => 10.52 + ((int) substr($submittedAt, 8, 2) * 0.001),
            'final_longitude' => 122.82 + ((int) substr($submittedAt, 8, 2) * 0.001),
            'location_source' => Report::LOCATION_SOURCE_GPS,
            'gps_accuracy' => 4.5,
            'affected_area_hectares' => $affectedArea,
            'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
            'affected_portion_percent' => min(95, round($affectedArea * 18, 2)),
            'affected_portion_measurement' => Report::MEASUREMENT_MEASURED,
            'sugarcane_variety' => 'PSR 86',
            'crop_age' => '6 months',
            'cane_class' => 'Class A',
            'observed_at' => CarbonImmutable::parse($submittedAt, 'UTC')->subMinutes(20),
            'submitted_at' => $submittedAt,
            'field_notes' => 'Synthetic field evidence recorded for local dashboard validation.',
            'mismatch_reported' => false,
            'reporter_suspected_condition' => null,
            'reporter_observation_text' => 'Synthetic observation recorded during the local development survey.',
            'predicted_label' => $label,
            'confidence' => $confidence,
            'checklist_consistency' => $label === Report::LABEL_HEALTHY ? 'consistent' : 'inconclusive',
            'reported_severity' => $affectedArea > 2 ? 'high' : 'moderate',
            'review_status' => $reviewStatus,
            'case_state' => $caseState,
            'verification_outcome' => $verificationOutcome,
            'field_validation_state' => $fieldValidationState,
            'referral_state' => $referralState,
            'action_taken' => $actionTaken,
            'authority_classified_condition' => $reviewStatus === Report::STATUS_VERIFIED_BY_STAFF
                || $reviewStatus === Report::STATUS_RESOLVED
                ? $label
                : null,
            'reviewer_id' => $reviewer?->getKey(),
            'reviewed_at' => $reviewedAt,
            'first_reviewed_at' => $reviewedAt === null
                ? null
                : CarbonImmutable::parse($reviewedAt, 'UTC')->subHours(2),
        ];
    }

    /**
     * @param  array<string, Report>  $reports
     */
    private function seedExpertConsults(array $reports, User $reviewer): void
    {
        ReportReferral::query()->firstOrCreate(
            [
                'report_id' => $reports['BGO-20261018-0630']->getKey(),
                'reference' => 'BGO-CONSULT-20261019',
            ],
            [
                'referred_by_id' => $reviewer->getKey(),
                'destination' => 'CaneGuard Regional Agronomy Desk',
                'referral_date' => '2026-10-19',
                'due_date' => '2026-10-23',
                'note' => 'Compare the mosaic evidence with the submitted field observation.',
                'response_date' => '2026-10-20',
                'response_note' => 'The attributed desk reviewed the supplied synthetic evidence.',
                'response_finding' => 'The image and field notes support mosaic.',
                'response_recorded_by_id' => $reviewer->getKey(),
                'response_recorded_at' => '2026-10-20 10:30:00',
                'consult_status' => ReportReferral::STATUS_COMPLETED,
                'expert_name' => 'Regional Agronomy Desk',
                'expert_contact' => 'agronomy-desk@caneguard.test',
                'share_full_context' => false,
                'finding_summary' => 'The attributed desk agrees with the possible condition.',
                'finding_details' => 'The submitted mosaic pattern is consistent with the field observation.',
                'finding_recommendation' => 'Continue row monitoring and remove affected plants as needed.',
                'finding_source' => ReportReferral::FINDING_SOURCE_IN_SYSTEM,
                'finding_recorded_by_id' => $reviewer->getKey(),
                'finding_recorded_at' => '2026-10-20 10:30:00',
                'office_case_state' => Report::CASE_STATE_CLOSED,
                'office_verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
                'office_field_validation_state' => Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
                'office_action_taken' => Report::ACTION_ADVISORY_PROVIDED,
                'office_authority_classified_condition' => Report::LABEL_MOSAIC,
                'office_review_notes' => 'The office position at handoff was awaiting an attributed finding.',
                'office_reviewer_id' => $reviewer->getKey(),
                'office_reviewed_at' => '2026-10-19 08:30:00',
            ],
        );

        ReportReferral::query()->firstOrCreate(
            [
                'report_id' => $reports['BGO-20261011-0910']->getKey(),
                'reference' => 'BGO-CONSULT-20261012',
            ],
            [
                'referred_by_id' => $reviewer->getKey(),
                'destination' => 'CaneGuard Regional Agronomy Desk',
                'referral_date' => '2026-10-12',
                'due_date' => '2026-10-18',
                'note' => 'Review the smut evidence after the field validation assignment.',
                'consult_status' => ReportReferral::STATUS_PENDING,
                'expert_name' => 'Regional Agronomy Desk',
                'expert_contact' => 'agronomy-desk@caneguard.test',
                'share_full_context' => false,
                'office_case_state' => Report::CASE_STATE_OPEN,
                'office_verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'office_field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'office_action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                'office_authority_classified_condition' => null,
                'office_review_notes' => 'The office is waiting for an attributed finding.',
                'office_reviewer_id' => $reviewer->getKey(),
                'office_reviewed_at' => '2026-10-12 13:10:00',
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function seedReport(
        string $referenceCode,
        array $attributes,
        User $reporter,
        string $image,
    ): Report {
        $report = Report::query()->firstOrCreate(
            ['reference_code' => $referenceCode],
            [
                ...$attributes,
                'reporter_id' => $reporter->getKey(),
                'image_path' => sprintf(
                    'reports/%s/%s.png',
                    CarbonImmutable::parse($attributes['submitted_at'], 'UTC')->format('Y-m'),
                    strtolower($referenceCode),
                ),
                'image_mime_type' => 'image/png',
                'image_size_bytes' => strlen($image),
                'image_source_type' => str_ends_with($referenceCode, '0') ? 'gallery' : 'camera',
                'source_width' => 1254,
                'source_height' => 1254,
                'model_version' => 'v1.0-mobilenetv2',
                'preprocess_ms' => 14,
                'inference_ms' => 108,
                'total_ms' => 138,
                'captured_at' => CarbonImmutable::parse($attributes['submitted_at'], 'UTC')->subMinutes(20),
                'review_notes' => $attributes['reviewed_at'] === null
                    ? null
                    : 'Reviewed against the submitted synthetic field evidence.',
                'lock_version' => 0,
            ],
        );

        $disk = Storage::disk('local');
        if (($report->wasRecentlyCreated || ! $disk->exists($report->image_path))
            && ! $disk->put($report->image_path, $image)) {
            throw new RuntimeException("Unable to store report image [{$referenceCode}].");
        }

        $labels = Report::v2Labels();
        $existingScoreLabels = DB::table('report_class_scores')
            ->where('report_id', $report->getKey())
            ->pluck('label')
            ->all();
        foreach ($labels as $label) {
            if (in_array($label, $existingScoreLabels, true)) {
                continue;
            }

            DB::table('report_class_scores')->insert([
                'report_id' => $report->getKey(),
                'label' => $label,
                'score' => $label === $report->predicted_label
                    ? $report->confidence
                    : round((1 - (float) $report->confidence) / (count($labels) - 1), 7),
            ]);
        }

        $symptomKey = $report->predicted_label === Report::LABEL_HEALTHY
            ? 'none'
            : $report->predicted_label;
        if (! DB::table('report_symptoms')
            ->where('report_id', $report->getKey())
            ->where('symptom_key', $symptomKey)
            ->exists()) {
            DB::table('report_symptoms')->insert([
                'report_id' => $report->getKey(),
                'symptom_key' => $symptomKey,
            ]);
        }

        return $report;
    }
}
