<?php

namespace Database\Seeders;

use App\Contracts\MobileFieldValidationCompletionContract;
use App\Models\Advisory;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\User;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Seed a small analytics dataset for exercising the report analytics surfaces.
 * All report evidence uses the mobile-report-upload-v2 shape.
 */
class DemoAnalyticsSeeder extends Seeder
{
    public const REFERENCE_PREFIX = 'BGO-DEMO50-';

    public const REPORT_COUNT = 50;

    private const REPORTS_PER_MONTH = 10;

    /**
     * DatabaseSeeder provides the accounts and office advisory catalog before
     * invoking this seeder as part of the complete demo dataset.
     */
    public function run(): void
    {
        $districtId = app(DistrictAccess::class)->pilotId()
            ?? throw new \LogicException('Seed the configured pilot district before seeding reports.');
        $reporter = User::query()->where('email', 'field@caneguard.test')->firstOrFail();
        $reviewer = User::query()->where('email', 'mao@caneguard.test')->firstOrFail();
        $admin = User::query()->where('email', 'admin@caneguard.test')->firstOrFail();
        $advisory = Advisory::query()->where('code', RailwayDemoData::reference('ADV-OFFICE-OPS-001'))->firstOrFail();

        $image = file_get_contents(database_path('seeders/assets/synthetic-sugarcane-rust.png'));
        $dimensions = is_string($image) ? getimagesizefromstring($image) : false;
        if (! is_string($image) || $dimensions === false) {
            throw new RuntimeException('The synthetic report image asset is invalid.');
        }

        $now = CarbonImmutable::now('Asia/Manila');
        $labels = Report::v2Labels();
        $statuses = Report::reviewStatuses();
        $barangays = array_keys(DashboardReportSeeder::BARANGAY_COORDINATES);
        $followUpOutcomes = MobileFieldValidationCompletionContract::field('follow_up_outcome')['enum'];
        $disk = Storage::disk('local');

        for ($ordinal = 0; $ordinal < self::REPORT_COUNT; $ordinal++) {
            $monthOffset = intdiv($ordinal, self::REPORTS_PER_MONTH);
            $sampleInMonth = $ordinal % self::REPORTS_PER_MONTH;
            $month = $now->startOfMonth()->subMonths($monthOffset);
            $submittedAt = $this->submittedAt($month, $sampleInMonth, $monthOffset, $now);
            $referenceCode = RailwayDemoData::reference(self::REFERENCE_PREFIX.sprintf('%04d', $ordinal + 1));
            $imagePath = RailwayDemoData::path('reports/demo-analytics/synthetic-field-evidence.png');

            if (! $disk->exists($imagePath) && ! $disk->put($imagePath, $image)) {
                throw new RuntimeException("Unable to store demo report image [{$imagePath}].");
            }

            $existing = Report::query()->where('reference_code', $referenceCode)->first();
            $label = $labels[$ordinal % count($labels)];
            $status = $statuses[$sampleInMonth % count($statuses)];
            $location = $this->location($ordinal, $barangays);
            $lifecycle = Report::lifecycleForReviewStatus($status);
            $assignmentState = null;
            if ($status === Report::STATUS_FOR_FIELD_VALIDATION) {
                $assignmentState = $sampleInMonth === 1
                    ? ($monthOffset % 2 === 0
                        ? Report::FIELD_VALIDATION_STATE_ASSIGNED
                        : Report::FIELD_VALIDATION_STATE_IN_PROGRESS)
                    : Report::FIELD_VALIDATION_STATE_COMPLETED;
                $lifecycle['field_validation_state'] = $assignmentState;
            }

            unset($lifecycle['referral_state']);
            $actionTaken = $this->actionTaken(
                $status,
                $monthOffset,
                $sampleInMonth,
            );
            $reviewerId = $actionTaken === null
                ? null
                : ($ordinal % 2 === 0 ? $reviewer->getKey() : $admin->getKey());
            $reviewedAt = $actionTaken === null ? null : $submittedAt->addHours(2);
            $authorityCondition = match ($status) {
                Report::STATUS_VERIFIED_BY_STAFF => $label,
                Report::STATUS_UNABLE_TO_VERIFY => Report::AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY,
                default => null,
            };

            $attributes = $this->reportAttributes(
                $ordinal,
                $existing,
                $reporter,
                $advisory,
                $reviewerId,
                $label,
                $status,
                $lifecycle,
                $actionTaken,
                $authorityCondition,
                $reviewedAt,
                $location,
                $submittedAt,
                $imagePath,
                strlen($image),
                $dimensions,
            );

            $attributes['district_id'] = $districtId;

            DB::transaction(function () use (
                $referenceCode,
                $attributes,
                $ordinal,
                $label,
                $image,
                $reporter,
                $reviewer,
                $admin,
                $assignmentState,
                $monthOffset,
                $followUpOutcomes,
                $disk,
            ): void {
                // The demo seeder refreshes only its own namespaced rows. Bypass
                // Report's immutable-upload update guard for those stable rows.
                $report = Report::withoutEvents(fn (): Report => Report::query()->updateOrCreate(
                    ['reference_code' => $referenceCode],
                    $attributes,
                ));

                $this->seedModelEvidence($report, $label, $ordinal);

                if ($assignmentState !== null) {
                    $assignment = $this->seedAssignment(
                        $report,
                        $assignmentState,
                        $reporter,
                        $ordinal % 2 === 0 ? $reviewer : $admin,
                    );

                    if ($assignmentState === Report::FIELD_VALIDATION_STATE_COMPLETED) {
                        $this->seedCompletion(
                            $report,
                            $assignment,
                            $monthOffset,
                            $followUpOutcomes,
                        );
                    }
                }

                if (! $disk->exists($report->image_path) && ! $disk->put($report->image_path, $image)) {
                    throw new RuntimeException("Unable to store demo report image [{$report->image_path}].");
                }
            });
        }
    }

    private function submittedAt(
        CarbonImmutable $month,
        int $sampleInMonth,
        int $monthOffset,
        CarbonImmutable $now,
    ): CarbonImmutable {
        $day = 1 + ($sampleInMonth * 2);
        if ($monthOffset === 0) {
            $day = min($day, $now->day);
        }

        $submittedAt = $month->addDays($day - 1)->setTime(
            7 + ($sampleInMonth % 4),
            ($sampleInMonth * 11) % 60,
        );

        $submittedAt = $submittedAt->greaterThanOrEqualTo($now)
            ? $now->subMinutes(2 + $sampleInMonth)
            : $submittedAt;

        return $submittedAt->utc();
    }

    /**
     * @param  array<int, string>  $barangays
     * @return array{barangay: string, latitude: float|null, longitude: float|null, source: string, reason: string|null, accuracy: float|null}
     */
    private function location(int $ordinal, array $barangays): array
    {
        $barangay = $barangays[$ordinal % count($barangays)];
        $coordinates = DashboardReportSeeder::BARANGAY_COORDINATES[$barangay];

        if ($ordinal % 13 === 0) {
            return [
                'barangay' => $barangay,
                'latitude' => null,
                'longitude' => null,
                'source' => Report::LOCATION_SOURCE_UNAVAILABLE,
                'reason' => Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
                'accuracy' => null,
            ];
        }

        $manual = $ordinal % 4 === 0;

        return [
            'barangay' => $barangay,
            'latitude' => $coordinates['latitude'],
            'longitude' => $coordinates['longitude'],
            'source' => $manual ? Report::LOCATION_SOURCE_MANUAL_MAP : Report::LOCATION_SOURCE_GPS,
            'reason' => null,
            'accuracy' => $manual ? null : round(3.5 + ($ordinal % 20) * 0.45, 2),
        ];
    }

    private function actionTaken(
        string $status,
        int $monthOffset,
        int $sampleInMonth,
    ): ?string {
        return match ($status) {
            Report::STATUS_FOR_FIELD_VALIDATION => $sampleInMonth === 1
                ? Report::ACTION_ADVISORY_PROVIDED
                : Report::ACTION_NO_FURTHER_ACTION_REQUIRED,
            Report::STATUS_VERIFIED_BY_STAFF => Report::ACTION_ADVISORY_PROVIDED,
            Report::STATUS_UNABLE_TO_VERIFY,
            Report::STATUS_RESOLVED => Report::ACTION_NO_FURTHER_ACTION_REQUIRED,
            Report::STATUS_SUBMITTED_UNVERIFIED => $monthOffset === 2 && $sampleInMonth === 0
                ? Report::ACTION_NO_FURTHER_ACTION_REQUIRED
                : null,
            default => null,
        };
    }

    /**
     * @param  array<string, string>  $lifecycle
     * @param  array{barangay: string, latitude: float|null, longitude: float|null, source: string, reason: string|null, accuracy: float|null}  $location
     * @param  array<int, mixed>  $dimensions
     * @return array<string, mixed>
     */
    private function reportAttributes(
        int $ordinal,
        ?Report $existing,
        User $reporter,
        Advisory $advisory,
        ?int $reviewerId,
        string $label,
        string $status,
        array $lifecycle,
        ?string $actionTaken,
        ?string $authorityCondition,
        ?CarbonImmutable $reviewedAt,
        array $location,
        CarbonImmutable $submittedAt,
        string $imagePath,
        int $imageSize,
        array $dimensions,
    ): array {
        $confidence = round(0.68 + ($ordinal % 25) * 0.012, 7);
        $areaMeasured = $ordinal % 5 !== 0;
        $portionMeasured = $ordinal % 7 !== 0;
        $isHealthy = $label === Report::LABEL_HEALTHY;
        $advisorySelected = $actionTaken === Report::ACTION_ADVISORY_PROVIDED;
        $advisorySelectedAt = $advisorySelected ? $reviewedAt : null;
        $advisoryDeliveredAt = $advisorySelectedAt?->addMinutes(5);
        $advisoryAcknowledgedAt = $ordinal % 2 === 0
            ? $advisoryDeliveredAt?->addDay()
            : null;

        return [
            'uuid' => $existing?->uuid ?? (string) Str::uuid(),
            'reporter_id' => $reporter->getKey(),
            'client_uuid' => $existing?->client_uuid ?? (string) Str::uuid(),
            'scan_record_client_uuid' => $existing?->scan_record_client_uuid ?? (string) Str::uuid(),
            'barangay' => $location['barangay'],
            'farmer_or_farm_owner_name' => sprintf('Demo Grower %02d', $ordinal + 1),
            'province' => 'Batangas',
            'municipality' => 'Nasugbu',
            'final_latitude' => $location['latitude'],
            'final_longitude' => $location['longitude'],
            'location_source' => $location['source'],
            'location_unavailable_reason' => $location['reason'],
            'gps_accuracy' => $location['accuracy'],
            'observed_at' => $submittedAt->subMinutes(20 + ($ordinal % 30)),
            'sugarcane_variety' => ['PSR 86', 'Co 86032', 'Magsasaka 1'][$ordinal % 3],
            'crop_age' => ['4 months', '6 months', '8 months', '10 months'][$ordinal % 4],
            'cane_class' => ['Class A', 'Class B', 'Class C'][$ordinal % 3],
            'affected_area_hectares' => $areaMeasured ? round(0.45 + ($ordinal % 17) * 0.16, 2) : null,
            'affected_area_measurement' => $areaMeasured
                ? Report::MEASUREMENT_MEASURED
                : Report::MEASUREMENT_NOT_MEASURED,
            'affected_portion_percent' => $portionMeasured ? 8 + (($ordinal * 7) % 80) : null,
            'affected_portion_measurement' => $portionMeasured
                ? Report::MEASUREMENT_MEASURED
                : Report::MEASUREMENT_NOT_MEASURED,
            'field_notes' => sprintf(
                'Synthetic demo observation: %s symptoms noted across a small block in %s.',
                $label,
                strtolower($location['barangay']),
            ),
            'mismatch_reported' => $ordinal % 9 === 0,
            'reporter_suspected_condition' => $ordinal % 4 === 0
                ? Report::REPORTER_CONCERN_RSSI
                : ($isHealthy ? null : $label),
            'reporter_observation_text' => sprintf(
                'Synthetic demo grower observation for the %s pattern; no real farmer information is included.',
                $label,
            ),
            'image_path' => $imagePath,
            'image_mime_type' => 'image/png',
            'image_size_bytes' => $imageSize,
            'image_source_type' => $ordinal % 2 === 0 ? 'camera' : 'gallery',
            'source_width' => $dimensions[0],
            'source_height' => $dimensions[1],
            'predicted_label' => $label,
            'confidence' => $confidence,
            'checklist_consistency' => $ordinal % 7 === 0
                ? 'inconclusive'
                : ($ordinal % 11 === 0 ? 'inconsistent' : 'consistent'),
            'reported_severity' => $isHealthy
                ? 'Mild'
                : (['Mild', 'Moderate', 'Severe'][$ordinal % 3]),
            'model_version' => 'v1.0-mobilenetv2',
            'preprocess_ms' => 8 + ($ordinal % 9),
            'inference_ms' => 75 + ($ordinal % 31),
            'total_ms' => 100 + ($ordinal % 40),
            'captured_at' => $submittedAt->subMinutes(30 + ($ordinal % 30)),
            'submitted_at' => $submittedAt,
            'review_status' => $status,
            ...$lifecycle,
            'advisory_id' => $advisorySelected ? $advisory->getKey() : null,
            'advisory_selected_by_id' => $advisorySelected ? $reviewerId : null,
            'advisory_selected_at' => $advisorySelectedAt,
            'advisory_delivery_state' => $advisorySelected
                ? ($advisoryAcknowledgedAt === null
                    ? Advisory::DELIVERY_DELIVERED
                    : Advisory::DELIVERY_ACKNOWLEDGED)
                : Advisory::DELIVERY_NOT_SELECTED,
            'advisory_delivered_at' => $advisoryDeliveredAt,
            'advisory_acknowledged_at' => $advisoryAcknowledgedAt,
            'action_taken' => $actionTaken,
            'review_notes' => $reviewerId === null
                ? null
                : 'Synthetic office review recorded for the analytics demo.',
            'authority_classified_condition' => $authorityCondition,
            'reviewer_id' => $reviewerId,
            'reviewed_at' => $reviewedAt,
            'first_reviewed_at' => $reviewedAt?->subMinutes(30),
        ];
    }

    private function seedModelEvidence(Report $report, string $label, int $ordinal): void
    {
        $labels = Report::v2Labels();
        $confidence = (float) $report->confidence;

        foreach ($labels as $scoreLabel) {
            DB::table('report_class_scores')->updateOrInsert(
                ['report_id' => $report->getKey(), 'label' => $scoreLabel],
                ['score' => $scoreLabel === $label
                    ? $confidence
                    : round((1 - $confidence) / (count($labels) - 1), 7)],
            );
        }

        DB::table('report_symptoms')->updateOrInsert(
            ['report_id' => $report->getKey(), 'symptom_key' => $label === Report::LABEL_HEALTHY ? 'none' : $label],
            [],
        );

        if ($ordinal % 11 === 0) {
            DB::table('report_quality_warnings')->updateOrInsert(
                ['report_id' => $report->getKey(), 'warning_key' => 'low-contrast'],
                [],
            );
        }
    }

    private function seedAssignment(
        Report $report,
        string $state,
        User $assignee,
        User $assignedBy,
    ): FieldValidationAssignment {
        $submittedAt = $report->submitted_at->timezone('Asia/Manila');
        $isCurrentMonth = $submittedAt->format('Y-m') === CarbonImmutable::now('Asia/Manila')->format('Y-m');
        $targetVisitDate = $state === Report::FIELD_VALIDATION_STATE_COMPLETED
            ? $submittedAt->addDays(2)->toDateString()
            : ($isCurrentMonth
                ? CarbonImmutable::now('Asia/Manila')->addDays(3)->toDateString()
                : $submittedAt->addDays(2)->toDateString());
        $existing = FieldValidationAssignment::query()->where('report_id', $report->getKey())->first();

        return FieldValidationAssignment::query()->updateOrCreate(
            ['report_id' => $report->getKey()],
            [
                'uuid' => $existing?->uuid ?? (string) Str::uuid(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $assignedBy->getKey(),
                'target_visit_date' => $targetVisitDate,
                'activated_at' => $submittedAt->addHours(2)->utc(),
            ],
        );
    }

    /**
     * @param  array<int, string>  $followUpOutcomes
     */
    private function seedCompletion(
        Report $report,
        FieldValidationAssignment $assignment,
        int $monthOffset,
        array $followUpOutcomes,
    ): void {
        $visitedAt = $report->submitted_at->addDays(3);
        if ($visitedAt->greaterThanOrEqualTo(CarbonImmutable::now('UTC'))) {
            $visitedAt = CarbonImmutable::now('UTC')->subHours(2);
        }
        $existing = FieldValidationCompletion::query()
            ->where('assignment_id', $assignment->getKey())
            ->first();

        FieldValidationCompletion::query()->updateOrCreate(
            ['assignment_id' => $assignment->getKey()],
            [
                'uuid' => $existing?->uuid ?? (string) Str::uuid(),
                'client_uuid' => $existing?->client_uuid ?? (string) Str::uuid(),
                'field_observation' => 'Synthetic follow-up observation recorded during the return visit.',
                'field_finding' => 'The monitored block was checked and the observed pattern was recorded for office review.',
                'action_taken' => 'Reviewed the synthetic demo field notes and scheduled any required next check.',
                'follow_up_outcome' => $followUpOutcomes[$monthOffset % count($followUpOutcomes)],
                'visited_at' => $visitedAt,
                'gps_outcome' => $report->final_latitude === null ? 'unavailable' : 'resolved',
                'gps_attempted_at' => $visitedAt->subMinutes(15),
                'gps_latitude' => $report->final_latitude,
                'gps_longitude' => $report->final_longitude,
                'gps_accuracy' => $report->gps_accuracy,
                'fresh_photo_path' => null,
                'fresh_photo_mime_type' => null,
                'fresh_photo_size_bytes' => null,
            ],
        );
    }
}
