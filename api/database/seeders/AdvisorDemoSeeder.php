<?php

namespace Database\Seeders;

use App\Models\Advisory;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\ReportReviewEvent;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class AdvisorDemoSeeder extends Seeder
{
    public const DEMO_ADVISORY_CODE = 'ADV-DEMO-01';

    /**
     * @var array<int, string>
     */
    public const DEMO_REPORT_REFERENCES = [
        'DEMO-CG-01',
        'DEMO-CG-02',
        'DEMO-CG-03',
        'DEMO-CG-04',
        'DEMO-CG-05',
        'DEMO-CG-06',
        'DEMO-CG-07',
    ];

    public function run(): void
    {
        $reporter = User::query()
            ->where('email', 'field@caneguard.test')
            ->firstOrFail();
        $reviewer = User::query()
            ->where('email', 'mao@caneguard.test')
            ->firstOrFail();
        $admin = User::query()
            ->where('email', 'admin@caneguard.test')
            ->firstOrFail();
        $expert = User::query()
            ->where('email', 'expert@caneguard.test')
            ->first();
        $image = file_get_contents(
            database_path('seeders/assets/synthetic-sugarcane-rust.png'),
        );

        if (! is_string($image)) {
            throw new RuntimeException('The demo image asset is invalid.');
        }

        $advisory = $this->seedAdvisory($reviewer);
        $reports = [];
        $hasFollowUpOutcome = Schema::hasColumn(
            'field_validation_completions',
            'follow_up_outcome',
        );

        foreach ($this->reportDefinitions(
            $reviewer,
            $admin,
            $advisory,
            $expert,
        ) as $referenceCode => $attributes) {
            $reports[$referenceCode] = $this->seedReport(
                $referenceCode,
                $attributes,
                $reporter,
                $image,
            );
        }

        $this->seedScheduledAssignment(
            $reports['DEMO-CG-01'],
            $reporter,
            $reviewer,
        );
        $this->seedAssignmentAndPhoto(
            $reports['DEMO-CG-02'],
            $reporter,
            $reviewer,
            $image,
            $hasFollowUpOutcome,
        );
        $this->seedAssignmentAndFollowUp(
            $reports['DEMO-CG-06'],
            $reporter,
            $reviewer,
            $hasFollowUpOutcome,
        );

        if ($expert !== null) {
            $this->seedCompletedConsult(
                $reports['DEMO-CG-03'],
                $reviewer,
                $expert,
            );
            $this->seedPendingConsult(
                $reports['DEMO-CG-04'],
                $reviewer,
                $expert,
            );
            $this->seedVerificationEvent(
                $reports['DEMO-CG-03'],
                $expert,
            );
        }
    }

    /**
     * Delete only the rows and files owned by this seeder.
     *
     * This is intentionally opt-in; normal seeding is add-only.
     */
    public static function cleanup(): void
    {
        $reportIds = Report::query()
            ->whereIn('reference_code', self::DEMO_REPORT_REFERENCES)
            ->pluck('id');
        $assignmentIds = FieldValidationAssignment::query()
            ->whereIn('report_id', $reportIds)
            ->pluck('id');
        $photoPaths = FieldValidationCompletion::query()
            ->whereIn('assignment_id', $assignmentIds)
            ->pluck('fresh_photo_path')
            ->filter()
            ->all();
        $reportImagePaths = Report::query()
            ->whereIn('id', $reportIds)
            ->pluck('image_path')
            ->filter()
            ->all();

        DB::transaction(function () use ($reportIds, $assignmentIds): void {
            FieldValidationCompletion::query()
                ->whereIn('assignment_id', $assignmentIds)
                ->delete();
            FieldValidationAssignment::query()
                ->whereIn('id', $assignmentIds)
                ->delete();
            ReportReferral::query()
                ->whereIn('report_id', $reportIds)
                ->delete();
            ReportReviewEvent::query()
                ->whereIn('report_id', $reportIds)
                ->delete();
            Report::query()
                ->whereIn('id', $reportIds)
                ->delete();
            Advisory::query()
                ->where('code', self::DEMO_ADVISORY_CODE)
                ->delete();
        });

        Storage::disk('local')->delete([
            ...$photoPaths,
            ...$reportImagePaths,
        ]);
    }

    /**
     * @return array<int, string>
     */
    public static function demoReportReferences(): array
    {
        return self::DEMO_REPORT_REFERENCES;
    }

    private function seedAdvisory(User $reviewer): Advisory
    {
        return Advisory::query()->firstOrCreate(
            ['code' => self::DEMO_ADVISORY_CODE],
            [
                'uuid' => '80000000-0000-4000-8000-000000000001',
                'title' => 'Rust sanitation and monitored follow-up',
                'content' => 'Remove heavily affected leaves, disinfect tools between rows, and schedule a follow-up visit when symptoms continue.',
                'status' => Advisory::STATUS_VALIDATED,
                'validation_provenance' => 'Validated against the 2026 CaneGuard office field guide.',
                'created_by_id' => $reviewer->getKey(),
                'validated_by_id' => $reviewer->getKey(),
                'validated_at' => CarbonImmutable::parse('2026-09-09 08:00:00', 'UTC'),
                'retired_by_id' => null,
                'retired_at' => null,
            ],
        );
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function reportDefinitions(
        User $reviewer,
        User $admin,
        Advisory $advisory,
        ?User $expert,
    ): array {
        $expertCase = $expert !== null;

        return [
            'DEMO-CG-01' => [
                'uuid' => '81000000-0000-4000-8000-000000000001',
                'client_uuid' => '82000000-0000-4000-8000-000000000001',
                'barangay' => 'Mabini',
                'farmer_or_farm_owner_name' => 'Demo Farm Alpha',
                'province' => 'Batangas',
                'municipality' => 'Lipa',
                'final_latitude' => 14.0667000,
                'final_longitude' => 120.6319000,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 4.20,
                'predicted_label' => Report::LABEL_RUST,
                'confidence' => 0.8400000,
                'checklist_consistency' => 'consistent',
                'reported_severity' => 'moderate',
                'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
                'reporter_observation_text' => 'The grower reports a recurring rust-like stress signal in the eastern rows.',
                'field_notes' => 'Keep this case visible in the register and schedule the next inspection.',
                'observed_at' => '2026-09-20 08:10:00.000',
                'submitted_at' => '2026-09-20 08:30:00.000',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
                'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                'authority_classified_condition' => Report::AUTHORITY_CONDITION_RSSI,
                'reviewer_id' => $reviewer->getKey(),
                'reviewed_at' => '2026-09-20 09:00:00.000',
                'first_reviewed_at' => '2026-09-20 09:00:00.000',
            ],
            'DEMO-CG-02' => [
                'uuid' => '81000000-0000-4000-8000-000000000002',
                'client_uuid' => '82000000-0000-4000-8000-000000000002',
                'barangay' => 'Mabini',
                'farmer_or_farm_owner_name' => 'Demo Farm Alpha',
                'province' => 'Batangas',
                'municipality' => 'Lipa',
                'final_latitude' => 14.0669000,
                'final_longitude' => 120.6321000,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 6.10,
                'predicted_label' => Report::LABEL_RUST,
                'confidence' => 0.7900000,
                'checklist_consistency' => 'consistent',
                'reported_severity' => 'moderate',
                'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
                'reporter_observation_text' => 'The follow-up visit checks the same farm after office guidance.',
                'field_notes' => 'Fresh validation evidence is available for authorized office review.',
                'observed_at' => '2026-09-16 07:45:00.000',
                'submitted_at' => '2026-09-16 08:00:00.000',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
                'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                'authority_classified_condition' => Report::AUTHORITY_CONDITION_RSSI,
                'reviewer_id' => $reviewer->getKey(),
                'reviewed_at' => '2026-09-16 09:00:00.000',
                'first_reviewed_at' => '2026-09-16 09:00:00.000',
            ],
            'DEMO-CG-03' => [
                'uuid' => '81000000-0000-4000-8000-000000000003',
                'client_uuid' => '82000000-0000-4000-8000-000000000003',
                'barangay' => 'Maligaya',
                'farmer_or_farm_owner_name' => 'Demo Farm Beta',
                'province' => 'Negros Occidental',
                'municipality' => 'Bago',
                'final_latitude' => 10.5334000,
                'final_longitude' => 122.8387000,
                'location_source' => Report::LOCATION_SOURCE_MANUAL_MAP,
                'gps_accuracy' => null,
                'predicted_label' => Report::LABEL_SMUT,
                'confidence' => 0.8800000,
                'checklist_consistency' => 'inconsistent',
                'reported_severity' => 'high',
                'reporter_suspected_condition' => Report::LABEL_SMUT,
                'reporter_observation_text' => 'Whip-like growths were reported in a small cluster.',
                'field_notes' => 'Completed consult feedback demonstrates expert-verification reporting.',
                'observed_at' => '2026-09-10 06:40:00.000',
                'submitted_at' => '2026-09-10 07:00:00.000',
                'review_status' => $expertCase
                    ? Report::STATUS_VERIFIED_BY_STAFF
                    : Report::STATUS_SUBMITTED_UNVERIFIED,
                'case_state' => $expertCase ? Report::CASE_STATE_CLOSED : Report::CASE_STATE_OPEN,
                'verification_outcome' => $expertCase
                    ? Report::VERIFICATION_OUTCOME_VERIFIED
                    : Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => $expertCase
                    ? Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED
                    : Report::REFERRAL_STATE_NOT_REFERRED,
                'action_taken' => $expertCase
                    ? Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION
                    : null,
                'authority_classified_condition' => $expertCase
                    ? Report::AUTHORITY_CONDITION_SMUT
                    : null,
                'reviewer_id' => $expertCase ? $reviewer->getKey() : null,
                'reviewed_at' => $expertCase ? '2026-09-14 10:00:00.000' : null,
                'first_reviewed_at' => $expertCase ? '2026-09-10 08:00:00.000' : null,
                'advisory_id' => $expertCase ? $advisory->getKey() : null,
                'advisory_selected_by_id' => $expertCase ? $reviewer->getKey() : null,
                'advisory_selected_at' => $expertCase ? '2026-09-14 10:00:00.000' : null,
                'advisory_delivery_state' => $expertCase
                    ? Report::ADVISORY_DELIVERY_DELIVERED
                    : Report::ADVISORY_DELIVERY_NOT_SELECTED,
                'advisory_delivered_at' => $expertCase ? '2026-09-14 10:01:00.000' : null,
            ],
            'DEMO-CG-04' => [
                'uuid' => '81000000-0000-4000-8000-000000000004',
                'client_uuid' => '82000000-0000-4000-8000-000000000004',
                'barangay' => 'Poblacion',
                'farmer_or_farm_owner_name' => 'Demo Farm Gamma',
                'province' => 'Tarlac',
                'municipality' => 'Concepcion',
                'final_latitude' => 15.3257000,
                'final_longitude' => 120.6570000,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 9.50,
                'predicted_label' => Report::LABEL_MOSAIC,
                'confidence' => 0.7300000,
                'checklist_consistency' => 'inconclusive',
                'reported_severity' => 'moderate',
                'reporter_suspected_condition' => Report::LABEL_MOSAIC,
                'reporter_observation_text' => 'The office requests a scoped expert review of the mixed symptoms.',
                'field_notes' => 'Assigned expert consult remains visible only in the expert workspace.',
                'observed_at' => '2026-09-19 08:20:00.000',
                'submitted_at' => '2026-09-19 08:45:00.000',
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => $expertCase
                    ? Report::REFERRAL_STATE_REFERRED
                    : Report::REFERRAL_STATE_NOT_REFERRED,
                'action_taken' => $expertCase
                    ? Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION
                    : null,
            ],
            'DEMO-CG-05' => [
                'uuid' => '81000000-0000-4000-8000-000000000005',
                'client_uuid' => '82000000-0000-4000-8000-000000000005',
                'barangay' => 'San Isidro',
                'farmer_or_farm_owner_name' => 'Demo Farm Delta',
                'province' => 'Batangas',
                'municipality' => 'Nasugbu',
                'final_latitude' => 14.0660000,
                'final_longitude' => 120.6325000,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 5.00,
                'predicted_label' => Report::LABEL_RUST,
                'confidence' => 0.8100000,
                'checklist_consistency' => 'consistent',
                'reported_severity' => 'low',
                'reporter_observation_text' => 'Office-approved guidance has been delivered to the case.',
                'field_notes' => 'Use this row to demonstrate validated advisory provenance and delivery state.',
                'observed_at' => '2026-09-12 09:00:00.000',
                'submitted_at' => '2026-09-12 09:20:00.000',
                'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
                'case_state' => Report::CASE_STATE_CLOSED,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
                'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
                'authority_classified_condition' => Report::AUTHORITY_CONDITION_RUST,
                'reviewer_id' => $reviewer->getKey(),
                'reviewed_at' => '2026-09-12 11:00:00.000',
                'first_reviewed_at' => '2026-09-12 10:00:00.000',
                'advisory_id' => $advisory->getKey(),
                'advisory_selected_by_id' => $admin->getKey(),
                'advisory_selected_at' => '2026-09-12 11:00:00.000',
                'advisory_delivery_state' => Report::ADVISORY_DELIVERY_DELIVERED,
                'advisory_delivered_at' => '2026-09-12 11:01:00.000',
            ],
            'DEMO-CG-06' => [
                'uuid' => '81000000-0000-4000-8000-000000000006',
                'client_uuid' => '82000000-0000-4000-8000-000000000006',
                'barangay' => 'San Roque',
                'farmer_or_farm_owner_name' => 'Demo Farm Epsilon',
                'province' => 'Negros Occidental',
                'municipality' => 'Silay',
                'final_latitude' => 10.8027000,
                'final_longitude' => 122.9709000,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 7.20,
                'predicted_label' => Report::LABEL_SMUT,
                'confidence' => 0.7600000,
                'checklist_consistency' => 'consistent',
                'reported_severity' => 'high',
                'reporter_suspected_condition' => Report::LABEL_SMUT,
                'reporter_observation_text' => 'Follow-up confirms the condition worsened after the first visit.',
                'field_notes' => 'Completed follow-up outcome is available to Needs assessment.',
                'observed_at' => '2026-09-15 07:30:00.000',
                'submitted_at' => '2026-09-15 08:00:00.000',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
                'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
                'reviewer_id' => $reviewer->getKey(),
                'reviewed_at' => '2026-09-17 09:00:00.000',
                'first_reviewed_at' => '2026-09-15 09:00:00.000',
            ],
            'DEMO-CG-07' => [
                'uuid' => '81000000-0000-4000-8000-000000000007',
                'client_uuid' => '82000000-0000-4000-8000-000000000007',
                'scan_record_client_uuid' => '83000000-0000-4000-8000-000000000007',
                'barangay' => 'San Roque',
                'farmer_or_farm_owner_name' => 'Demo Farm Zeta',
                'province' => 'Tarlac',
                'municipality' => 'Bamban',
                'final_latitude' => null,
                'final_longitude' => null,
                'location_source' => Report::LOCATION_SOURCE_UNAVAILABLE,
                'location_unavailable_reason' => Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
                'gps_accuracy' => null,
                'predicted_label' => Report::LABEL_SMUT,
                'confidence' => 0.6800000,
                'checklist_consistency' => 'inconclusive',
                'reported_severity' => 'moderate',
                'reporter_suspected_condition' => Report::LABEL_SMUT,
                'reporter_observation_text' => 'The field report was submitted offline without a map fix.',
                'field_notes' => 'Model V1 report with explicit unavailable-location provenance.',
                'observed_at' => '2026-09-18 06:15:00.000',
                'submitted_at' => '2026-09-18 06:20:00.000',
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
                'action_taken' => null,
            ],
        ];
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
        $number = (int) substr($referenceCode, -2);
        $report = Report::query()->firstOrCreate(
            ['reference_code' => $referenceCode],
            [
                ...$attributes,
                'reporter_id' => $reporter->getKey(),
                'image_path' => sprintf('seeded/demo-report-%02d.png', $number),
                'image_mime_type' => 'image/png',
                'image_size_bytes' => strlen($image),
                'image_source_type' => $number % 2 === 0 ? 'gallery' : 'camera',
                'source_width' => 1254,
                'source_height' => 1254,
                'model_version' => 'v1.0-mobilenetv2',
                'preprocess_ms' => 12 + $number,
                'inference_ms' => 96 + ($number * 2),
                'total_ms' => 124 + ($number * 3),
                'captured_at' => CarbonImmutable::parse($attributes['submitted_at'], 'UTC')->subMinutes(20),
                'review_notes' => $attributes['review_notes'] ?? 'Seeded feature demonstration.',
                'lock_version' => 0,
            ],
        );

        $disk = Storage::disk('local');
        if (($report->wasRecentlyCreated || ! $disk->exists($report->image_path))
            && ! $disk->put($report->image_path, $image)) {
            throw new RuntimeException("Unable to seed demo report image [{$referenceCode}].");
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

        if (! DB::table('report_quality_warnings')
            ->where('report_id', $report->getKey())
            ->where('warning_key', 'demo-seeded-evidence')
            ->exists()) {
            DB::table('report_quality_warnings')->insert([
                'report_id' => $report->getKey(),
                'warning_key' => 'demo-seeded-evidence',
            ]);
        }

        return $report;
    }

    private function seedScheduledAssignment(
        Report $report,
        User $reporter,
        User $reviewer,
    ): void {
        FieldValidationAssignment::query()->firstOrCreate(
            ['report_id' => $report->getKey()],
            [
                'uuid' => '84000000-0000-4000-8000-000000000001',
                'assignee_id' => $reporter->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-24',
                'activated_at' => CarbonImmutable::parse('2026-09-20 09:00:00', 'UTC'),
            ],
        );
    }

    private function seedAssignmentAndPhoto(
        Report $report,
        User $reporter,
        User $reviewer,
        string $image,
        bool $hasFollowUpOutcome,
    ): void {
        $assignment = FieldValidationAssignment::query()->firstOrCreate(
            ['report_id' => $report->getKey()],
            [
                'uuid' => '84000000-0000-4000-8000-000000000002',
                'assignee_id' => $reporter->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-18',
                'activated_at' => CarbonImmutable::parse('2026-09-16 08:00:00', 'UTC'),
            ],
        );
        $completionAttributes = [
            'uuid' => '85000000-0000-4000-8000-000000000002',
            'client_uuid' => '86000000-0000-4000-8000-000000000002',
            'field_observation' => 'The monitored rows show fewer rust symptoms after sanitation guidance.',
            'field_finding' => 'The farm is suitable for continued office follow-up.',
            'action_taken' => 'Disinfected tools and marked the row for another inspection.',
            'visited_at' => CarbonImmutable::parse('2026-09-18 07:30:00', 'UTC'),
            'gps_outcome' => 'resolved',
            'gps_attempted_at' => CarbonImmutable::parse('2026-09-18 07:20:00', 'UTC'),
            'gps_latitude' => 14.0669000,
            'gps_longitude' => 120.6321000,
            'gps_accuracy' => 6.10,
            'fresh_photo_path' => 'field-validation/demo-cg-02.png',
            'fresh_photo_mime_type' => 'image/png',
            'fresh_photo_size_bytes' => strlen($image),
        ];
        if ($hasFollowUpOutcome) {
            $completionAttributes['follow_up_outcome'] = 'improved';
        }

        $completion = FieldValidationCompletion::query()->firstOrCreate(
            ['assignment_id' => $assignment->getKey()],
            $completionAttributes,
        );
        $this->ensureCompletionPhoto($completion, $image);
    }

    private function seedAssignmentAndFollowUp(
        Report $report,
        User $reporter,
        User $reviewer,
        bool $hasFollowUpOutcome,
    ): void {
        $assignment = FieldValidationAssignment::query()->firstOrCreate(
            ['report_id' => $report->getKey()],
            [
                'uuid' => '84000000-0000-4000-8000-000000000006',
                'assignee_id' => $reporter->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-16',
                'activated_at' => CarbonImmutable::parse('2026-09-15 08:00:00', 'UTC'),
            ],
        );
        $completionAttributes = [
            'uuid' => '85000000-0000-4000-8000-000000000006',
            'client_uuid' => '86000000-0000-4000-8000-000000000006',
            'field_observation' => 'The affected patch expanded along the southern edge of the farm.',
            'field_finding' => 'The condition worsened and needs a renewed office response.',
            'action_taken' => 'Flagged the affected rows and requested an additional inspection.',
            'visited_at' => CarbonImmutable::parse('2026-09-16 07:15:00', 'UTC'),
            'gps_outcome' => 'low_accuracy',
            'gps_attempted_at' => CarbonImmutable::parse('2026-09-16 07:05:00', 'UTC'),
            'gps_latitude' => 10.8027000,
            'gps_longitude' => 122.9709000,
            'gps_accuracy' => 38.00,
        ];
        if ($hasFollowUpOutcome) {
            $completionAttributes['follow_up_outcome'] = 'worsened';
        }

        FieldValidationCompletion::query()->firstOrCreate(
            ['assignment_id' => $assignment->getKey()],
            $completionAttributes,
        );
    }

    private function ensureCompletionPhoto(
        FieldValidationCompletion $completion,
        string $image,
    ): void {
        $path = $completion->fresh_photo_path;
        if ($path === null) {
            $path = 'field-validation/demo-cg-02.png';
            $completion->forceFill([
                'fresh_photo_path' => $path,
                'fresh_photo_mime_type' => 'image/png',
                'fresh_photo_size_bytes' => strlen($image),
            ])->save();
        }

        if (! Storage::disk('local')->exists($path)
            && ! Storage::disk('local')->put($path, $image)) {
            throw new RuntimeException('Unable to seed the authorized validation photo.');
        }
    }

    private function seedCompletedConsult(
        Report $report,
        User $reviewer,
        User $expert,
    ): void {
        ReportReferral::query()->firstOrCreate(
            [
                'report_id' => $report->getKey(),
                'reference' => 'CONSULT-DEMO-03',
            ],
            [
                'referred_by_id' => $reviewer->getKey(),
                'expert_id' => $expert->getKey(),
                'destination' => 'CaneGuard Expert Desk',
                'referral_date' => '2026-09-11',
                'due_date' => '2026-09-14',
                'expert_name' => $expert->name,
                'expert_contact' => $expert->email,
                'share_full_context' => false,
                'note' => 'Please compare the smut evidence with the field observation.',
                'consult_status' => ReportReferral::STATUS_COMPLETED,
                'response_date' => '2026-09-14',
                'response_note' => 'The attributed expert reviewed the supplied evidence.',
                'response_finding' => 'The field evidence is consistent with sugarcane smut.',
                'response_recorded_by_id' => $expert->getKey(),
                'response_recorded_at' => '2026-09-14 09:30:00.000',
                'finding_summary' => 'Expert confirms the reported condition.',
                'finding_details' => 'Whip-like growths and the image evidence support smut.',
                'finding_recommendation' => 'Remove affected stalks and monitor the adjacent rows.',
                'finding_source' => ReportReferral::FINDING_SOURCE_IN_SYSTEM,
                'finding_recorded_by_id' => $expert->getKey(),
                'finding_recorded_at' => '2026-09-14 09:30:00.000',
                'office_case_state' => Report::CASE_STATE_OPEN,
                'office_verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'office_field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'office_action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
                'office_authority_classified_condition' => null,
                'office_review_notes' => 'The office position at handoff was awaiting expert input.',
                'office_reviewer_id' => $reviewer->getKey(),
                'office_reviewed_at' => '2026-09-11 08:00:00.000',
            ],
        );
    }

    private function seedPendingConsult(
        Report $report,
        User $reviewer,
        User $expert,
    ): void {
        ReportReferral::query()->firstOrCreate(
            [
                'report_id' => $report->getKey(),
                'reference' => 'CONSULT-DEMO-04',
            ],
            [
                'referred_by_id' => $reviewer->getKey(),
                'expert_id' => $expert->getKey(),
                'destination' => 'CaneGuard Expert Desk',
                'referral_date' => '2026-09-19',
                'due_date' => '2026-09-26',
                'expert_name' => $expert->name,
                'expert_contact' => $expert->email,
                'share_full_context' => false,
                'note' => 'Review the mixed symptoms and provide an attributed finding.',
                'consult_status' => ReportReferral::STATUS_PENDING,
                'response_date' => null,
                'response_note' => null,
                'response_finding' => null,
                'response_recorded_by_id' => null,
                'response_recorded_at' => null,
                'finding_summary' => null,
                'finding_details' => null,
                'finding_recommendation' => null,
                'finding_source' => null,
                'finding_recorded_by_id' => null,
                'finding_recorded_at' => null,
                'office_case_state' => Report::CASE_STATE_OPEN,
                'office_verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'office_field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'office_action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
                'office_authority_classified_condition' => null,
                'office_review_notes' => 'Scoped to the assigned expert workspace.',
                'office_reviewer_id' => $reviewer->getKey(),
                'office_reviewed_at' => '2026-09-19 09:00:00.000',
            ],
        );
    }

    private function seedVerificationEvent(Report $report, User $expert): void
    {
        $attributes = [
            'report_id' => $report->getKey(),
            'actor_id' => $expert->getKey(),
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
        ];
        if (ReportReviewEvent::query()->where($attributes)->exists()) {
            return;
        }

        ReportReviewEvent::query()->create([
            ...$attributes,
            'action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
            'notes' => 'Attributed expert verification recorded for the monthly feedback loop.',
            'case_state' => Report::CASE_STATE_OPEN,
            'created_at' => '2026-09-14 09:30:00.000',
        ]);
    }
}
