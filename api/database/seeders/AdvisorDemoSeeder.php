<?php

namespace Database\Seeders;

use App\Models\Advisory;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\ReportClassScore;
use App\Models\ReportReviewEvent;
use App\Models\ReportSymptom;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class AdvisorDemoSeeder extends Seeder
{
    public const ADVISORY_CODE = 'ADV-BGO-RUST-01';

    /**
     * @var array<int, string>
     */
    public const REPORT_REFERENCES = [
        'BGO-20260920-0810',
        'BGO-20260916-0745',
        'BGO-20260910-0640',
        'BGO-20260919-0820',
        'BGO-20260912-0900',
        'BGO-20260915-0730',
        'BGO-20260918-0615',
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
        $image = file_get_contents(
            database_path('seeders/assets/synthetic-sugarcane-rust.png'),
        );

        if (! is_string($image)) {
            throw new RuntimeException('The report image asset is invalid.');
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
        ) as $referenceCode => $attributes) {
            $reports[$referenceCode] = $this->seedReport(
                $referenceCode,
                $attributes,
                $reporter,
                $image,
            );
        }

        $this->seedScheduledAssignment(
            $reports['BGO-20260920-0810'],
            $reporter,
            $reviewer,
        );
        $this->seedAssignmentAndPhoto(
            $reports['BGO-20260916-0745'],
            $reporter,
            $reviewer,
            $image,
            $hasFollowUpOutcome,
        );
        $this->seedAssignmentAndFollowUp(
            $reports['BGO-20260915-0730'],
            $reporter,
            $reviewer,
            $hasFollowUpOutcome,
        );
        $this->seedTodayAssignment(
            $reports['BGO-20260918-0615'],
            $reporter,
            $reviewer,
        );

    }

    /**
     * Delete only the rows and files owned by this seeder.
     *
     * This is intentionally opt-in; normal seeding updates stable demo rows.
     */
    public static function cleanup(): void
    {
        $reportIds = Report::query()
            ->whereIn('reference_code', self::REPORT_REFERENCES)
            ->whereDoesntHave('referrals')
            ->whereDoesntHave('handoffNotes')
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
            ReportReviewEvent::query()
                ->whereIn('report_id', $reportIds)
                ->delete();
            Report::query()
                ->whereIn('id', $reportIds)
                ->delete();
            Advisory::query()
                ->where('code', self::ADVISORY_CODE)
                ->whereNotIn('id', Report::query()->whereNotNull('advisory_id')->select('advisory_id'))
                ->delete();
        });

        $paths = array_unique([...$photoPaths, ...$reportImagePaths]);
        foreach ($paths as $path) {
            if (! Report::query()->where('image_path', $path)->exists()
                && ! FieldValidationCompletion::query()->where('fresh_photo_path', $path)->exists()) {
                Storage::disk('local')->delete($path);
            }
        }
    }

    /**
     * @return array<int, string>
     */
    public static function reportReferences(): array
    {
        return self::REPORT_REFERENCES;
    }

    private function seedAdvisory(User $reviewer): Advisory
    {
        return Advisory::query()->updateOrCreate(
            ['code' => self::ADVISORY_CODE],
            [
                'uuid' => '389cb205-7897-42d0-80ec-3468eeab8b3d',
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
    ): array {

        return [
            'BGO-20260920-0810' => [
                'uuid' => 'a5651b25-a895-4929-8d36-a9e41681cec9',
                'client_uuid' => '4227ad87-0f1a-4b77-a7b0-a43d7e6492f0',
                'barangay' => 'Balaytigui',
                'farmer_or_farm_owner_name' => 'Rogelio Manalo',
                'province' => 'Batangas',
                'municipality' => 'Nasugbu',
                'final_latitude' => 14.1260000,
                'final_longitude' => 120.6039000,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 4.20,
                'predicted_label' => Report::LABEL_RUST,
                'confidence' => 0.8400000,
                'checklist_consistency' => 'consistent',
                'reported_severity' => 'Moderate',
                'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
                'reporter_observation_text' => 'The grower says the eastern rows have developed fine orange flecks that do not clear after rain.',
                'field_notes' => 'Keep the visit open for a field check of the affected eastern rows.',
                'observed_at' => '2026-09-20 08:10:00.000',
                'submitted_at' => '2026-09-20 08:30:00.000',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                'authority_classified_condition' => Report::AUTHORITY_CONDITION_RUST,
                'reviewer_id' => $reviewer->getKey(),
                'reviewed_at' => '2026-09-20 09:00:00.000',
                'first_reviewed_at' => '2026-09-20 09:00:00.000',
            ],
            'BGO-20260916-0745' => [
                'uuid' => 'd61de03b-a8a9-4050-be72-d1a0e7220e7a',
                'client_uuid' => 'd3a04825-985b-4e95-874a-435e63919f34',
                'barangay' => 'Balaytigui',
                'farmer_or_farm_owner_name' => 'Rogelio Manalo',
                'province' => 'Batangas',
                'municipality' => 'Nasugbu',
                'final_latitude' => 14.1260000,
                'final_longitude' => 120.6039000,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 6.10,
                'predicted_label' => Report::LABEL_RUST,
                'confidence' => 0.7900000,
                'checklist_consistency' => 'consistent',
                'reported_severity' => 'Moderate',
                'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
                'reporter_observation_text' => 'The follow-up visit checks the same block after the office sanitation guidance.',
                'field_notes' => 'Fewer orange flecks were noted along the eastern edge during the return visit.',
                'observed_at' => '2026-09-16 07:45:00.000',
                'submitted_at' => '2026-09-16 08:00:00.000',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
                'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                'authority_classified_condition' => Report::AUTHORITY_CONDITION_RUST,
                'reviewer_id' => $reviewer->getKey(),
                'reviewed_at' => '2026-09-16 09:00:00.000',
                'first_reviewed_at' => '2026-09-16 09:00:00.000',
            ],
            'BGO-20260910-0640' => [
                'uuid' => 'fb81c717-d314-4569-a28f-3158e6cfdb94',
                'client_uuid' => '2778c1eb-7419-4580-9f11-da891dddafe0',
                'barangay' => 'Bilaran',
                'farmer_or_farm_owner_name' => 'Lorna Villanueva',
                'province' => 'Batangas',
                'municipality' => 'Nasugbu',
                'final_latitude' => 14.0487000,
                'final_longitude' => 120.6846000,
                'location_source' => Report::LOCATION_SOURCE_MANUAL_MAP,
                'gps_accuracy' => null,
                'predicted_label' => Report::LABEL_SMUT,
                'confidence' => 0.8800000,
                'checklist_consistency' => 'inconsistent',
                'reported_severity' => 'Severe',
                'reporter_suspected_condition' => Report::LABEL_SMUT,
                'reporter_observation_text' => 'Several stalks carry dark whip-like growths near the top leaves.',
                'field_notes' => 'The office requested an attributed review after comparing the image with the field checklist.',
                'observed_at' => '2026-09-10 06:40:00.000',
                'submitted_at' => '2026-09-10 07:00:00.000',
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'action_taken' => null,
                'authority_classified_condition' => null,
                'reviewer_id' => null,
                'reviewed_at' => null,
                'first_reviewed_at' => null,
                'advisory_id' => null,
                'advisory_selected_by_id' => null,
                'advisory_selected_at' => null,
                'advisory_delivery_state' => Report::ADVISORY_DELIVERY_NOT_SELECTED,
                'advisory_delivered_at' => null,
            ],
            'BGO-20260919-0820' => [
                'uuid' => '8f0e9123-4df7-4574-9074-962b1929b878',
                'client_uuid' => 'd559d384-5677-49f0-a710-fa82a2cc34ea',
                'barangay' => 'Banilad',
                'farmer_or_farm_owner_name' => 'Danilo Panganiban',
                'province' => 'Batangas',
                'municipality' => 'Nasugbu',
                'final_latitude' => 14.0730000,
                'final_longitude' => 120.7408000,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 9.50,
                'predicted_label' => Report::LABEL_RUST,
                'confidence' => 0.7300000,
                'checklist_consistency' => 'inconclusive',
                'reported_severity' => 'Moderate',
                'reporter_suspected_condition' => 'Red stripe',
                'reporter_observation_text' => 'Narrow red bands run along the midrib on several leaves, with no clear orange pustules.',
                'field_notes' => 'The submitted pattern may be red stripe rather than leaf rust; review the field evidence.',
                'observed_at' => '2026-09-19 08:20:00.000',
                'submitted_at' => '2026-09-19 08:45:00.000',
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'action_taken' => null,
            ],
            'BGO-20260912-0900' => [
                'uuid' => 'ff502f07-b595-42ac-81f5-68c289b7b931',
                'client_uuid' => '59842f7b-cfed-4604-963f-4de02dd31e44',
                'barangay' => 'Bulihan',
                'farmer_or_farm_owner_name' => 'Corazon Alonzo',
                'province' => 'Batangas',
                'municipality' => 'Nasugbu',
                'final_latitude' => 14.1552000,
                'final_longitude' => 120.6540000,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 5.00,
                'predicted_label' => Report::LABEL_RUST,
                'confidence' => 0.8100000,
                'checklist_consistency' => 'consistent',
                'reported_severity' => 'Mild',
                'reporter_observation_text' => 'Orange pustules are scattered across older leaves along the southern row.',
                'field_notes' => 'The office sent sanitation guidance and will compare the next visit with this record.',
                'observed_at' => '2026-09-12 09:00:00.000',
                'submitted_at' => '2026-09-12 09:20:00.000',
                'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
                'case_state' => Report::CASE_STATE_CLOSED,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
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
            'BGO-20260915-0730' => [
                'uuid' => 'cdeb885f-1f01-4a38-b79f-9113723c4363',
                'client_uuid' => '9a8263ee-c325-4227-8f84-1fe269252c16',
                'barangay' => 'Bucana',
                'farmer_or_farm_owner_name' => 'Teodoro Gamboa',
                'province' => 'Batangas',
                'municipality' => 'Nasugbu',
                'final_latitude' => 14.0678000,
                'final_longitude' => 120.6267000,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 7.20,
                'predicted_label' => Report::LABEL_SMUT,
                'confidence' => 0.7600000,
                'checklist_consistency' => 'consistent',
                'reported_severity' => 'Severe',
                'reporter_suspected_condition' => Report::LABEL_SMUT,
                'reporter_observation_text' => 'The marked patch has more thin stalks and dark whips than at the first visit.',
                'field_notes' => 'The affected rows were flagged for another office check after the condition worsened.',
                'observed_at' => '2026-09-15 07:30:00.000',
                'submitted_at' => '2026-09-15 08:00:00.000',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
                'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
                'reviewer_id' => $reviewer->getKey(),
                'reviewed_at' => '2026-09-17 09:00:00.000',
                'first_reviewed_at' => '2026-09-15 09:00:00.000',
            ],
            'BGO-20260918-0615' => [
                'uuid' => '1a123908-927b-43e7-9e5a-a6970c488ffd',
                'client_uuid' => '54ef47b9-e620-482c-bfc4-cd63721d7abf',
                'scan_record_client_uuid' => 'efcb6026-044d-4c4c-b330-cbdc111d7aef',
                'barangay' => 'Dayap',
                'farmer_or_farm_owner_name' => 'Nena Salcedo',
                'province' => 'Batangas',
                'municipality' => 'Nasugbu',
                'final_latitude' => null,
                'final_longitude' => null,
                'location_source' => Report::LOCATION_SOURCE_UNAVAILABLE,
                'location_unavailable_reason' => Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
                'gps_accuracy' => null,
                'predicted_label' => Report::LABEL_HEALTHY,
                'confidence' => 0.9400000,
                'checklist_consistency' => 'consistent',
                'reported_severity' => 'Mild',
                'reporter_observation_text' => 'Leaves were evenly green at the edge of the block; no obvious lesion was recorded before the phone lost its map fix.',
                'field_notes' => 'Submitted offline with a clear crop view but without a recoverable location.',
                'observed_at' => '2026-09-18 06:15:00.000',
                'submitted_at' => '2026-09-18 06:20:00.000',
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
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
        unset($attributes['referral_state']);
        $number = array_search($referenceCode, self::REPORT_REFERENCES, true) + 1;
        $report = Report::withoutEvents(fn (): Report => Report::query()->updateOrCreate(
            ['reference_code' => $referenceCode],
            [
                ...$attributes,
                'reporter_id' => $reporter->getKey(),
                'affected_area_measurement' => $attributes['affected_area_measurement']
                    ?? (($attributes['affected_area_hectares'] ?? null) === null
                        ? Report::MEASUREMENT_NOT_MEASURED
                        : Report::MEASUREMENT_MEASURED),
                'affected_portion_measurement' => $attributes['affected_portion_measurement']
                    ?? (($attributes['affected_portion_percent'] ?? null) === null
                        ? Report::MEASUREMENT_NOT_MEASURED
                        : Report::MEASUREMENT_MEASURED),
                'image_path' => sprintf('reports/2026-09/%s.png', strtolower($referenceCode)),
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
                'review_notes' => $attributes['review_notes'] ?? 'Reviewed against the submitted field evidence.',
                'lock_version' => 0,
            ],
        ));

        $disk = Storage::disk('local');
        if (($report->wasRecentlyCreated || ! $disk->exists($report->image_path))
            && ! $disk->put($report->image_path, $image)) {
            throw new RuntimeException("Unable to store report image [{$referenceCode}].");
        }

        $labels = Report::v2Labels();
        foreach ($labels as $label) {
            ReportClassScore::query()->firstOrCreate(
                ['report_id' => $report->getKey(), 'label' => $label],
                ['score' => $label === $report->predicted_label
                    ? $report->confidence
                    : round((1 - (float) $report->confidence) / (count($labels) - 1), 7)],
            );
        }

        $symptomKey = $report->predicted_label === Report::LABEL_HEALTHY
            ? 'none'
            : $report->predicted_label;
        ReportSymptom::query()->firstOrCreate([
            'report_id' => $report->getKey(),
            'symptom_key' => $symptomKey,
        ]);

        return $report;
    }

    private function seedScheduledAssignment(
        Report $report,
        User $reporter,
        User $reviewer,
    ): void {
        FieldValidationAssignment::query()->updateOrCreate(
            ['report_id' => $report->getKey()],
            [
                'uuid' => '885b0373-0c86-41d8-a838-0921c71f3a35',
                'assignee_id' => $reporter->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-19',
                'activated_at' => CarbonImmutable::parse('2026-09-21 09:00:00', 'UTC'),
            ],
        );
    }

    private function seedTodayAssignment(
        Report $report,
        User $reporter,
        User $reviewer,
    ): void {
        FieldValidationAssignment::query()->updateOrCreate(
            ['report_id' => $report->getKey()],
            [
                'uuid' => 'efcb6026-044d-4c4c-b330-cbdc111d7aef',
                'assignee_id' => $reporter->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-22',
                'activated_at' => CarbonImmutable::parse('2026-09-21 09:15:00', 'UTC'),
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
        $assignment = FieldValidationAssignment::query()->updateOrCreate(
            ['report_id' => $report->getKey()],
            [
                'uuid' => '6feab924-3ecd-49f2-96c2-5fb878ef48f6',
                'assignee_id' => $reporter->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-24',
                'activated_at' => CarbonImmutable::parse('2026-09-16 08:00:00', 'UTC'),
            ],
        );
        $completionAttributes = [
            'uuid' => '0d81b69b-4db2-4352-81e1-d943d34d9ee8',
            'client_uuid' => '2936e0f6-299d-47f3-8da6-53cb50283263',
            'field_observation' => 'The monitored rows show fewer orange flecks after sanitation guidance.',
            'field_finding' => 'The block is recovering and remains suitable for routine office follow-up.',
            'action_taken' => 'Disinfected tools and marked the eastern row for another inspection.',
            'visited_at' => CarbonImmutable::parse('2026-09-18 07:30:00', 'UTC'),
            'gps_outcome' => 'resolved',
            'gps_attempted_at' => CarbonImmutable::parse('2026-09-18 07:20:00', 'UTC'),
            'gps_latitude' => 14.1260000,
            'gps_longitude' => 120.6039000,
            'gps_accuracy' => 6.10,
            'fresh_photo_path' => 'field-validation/2026-09-18-balaytigui.png',
            'fresh_photo_mime_type' => 'image/png',
            'fresh_photo_size_bytes' => strlen($image),
        ];
        if ($hasFollowUpOutcome) {
            $completionAttributes['follow_up_outcome'] = 'improved';
        }

        $completion = FieldValidationCompletion::query()->updateOrCreate(
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
        $assignment = FieldValidationAssignment::query()->updateOrCreate(
            ['report_id' => $report->getKey()],
            [
                'uuid' => '7649e5e2-cdec-45aa-9f1a-8500272527b8',
                'assignee_id' => $reporter->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-22',
                'activated_at' => CarbonImmutable::parse('2026-09-21 08:00:00', 'UTC'),
            ],
        );
        $completionAttributes = [
            'uuid' => '88797c37-3af2-4adb-81ca-fa1dc78d2dcd',
            'client_uuid' => '9a99f389-b8d0-49d6-968e-ad9c183c3f8c',
            'field_observation' => 'The marked patch has more thin stalks and dark whips than at the first visit.',
            'field_finding' => 'The smut symptoms worsened and need a renewed office response.',
            'action_taken' => 'Flagged the affected rows and requested an additional inspection.',
            'visited_at' => CarbonImmutable::parse('2026-09-16 07:15:00', 'UTC'),
            'gps_outcome' => 'low_accuracy',
            'gps_attempted_at' => CarbonImmutable::parse('2026-09-16 07:05:00', 'UTC'),
            'gps_latitude' => 14.0678000,
            'gps_longitude' => 120.6267000,
            'gps_accuracy' => 38.00,
        ];
        if ($hasFollowUpOutcome) {
            $completionAttributes['follow_up_outcome'] = 'worsened';
        }

        FieldValidationCompletion::query()->updateOrCreate(
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
            $path = 'field-validation/2026-09-18-balaytigui.png';
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
}
