<?php

namespace Database\Seeders;

use App\Models\Advisory;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\ReportClassScore;
use App\Models\ReportQualityWarning;
use App\Models\ReportSymptom;
use App\Models\User;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Seed the month-spanning records used by the local dashboard overview.
 *
 * The records are deliberately ordinary office reports: they share
 * one geography, use stable fictional names, and exercise the operational
 * states that the overview summarizes. Its stable report references are
 * updated on each run; DatabaseSeeder calls it for the complete local dashboard.
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

    /** @var array<int, string> */
    private const BARANGAYS = [
        'Aga',
        'Balaytigui',
        'Banilad',
        'Bilaran',
        'Bucana',
        'Bulihan',
        'Bunducan',
        'Butucan',
        'Calayo',
        'Catandaan',
        'Cogunan',
        'Dayap',
    ];

    /**
     * Approximate barangay reference points from the PhilAtlas Nasugbu profiles.
     * The names match the PSA PSGC list; centers and the full generated jitter
     * envelope were checked against OSM Nasugbu municipal relation 7340421.
     * Sources: https://psa.gov.ph/classification/psgc/barangays/0401019000
     * https://www.philatlas.com/luzon/r04a/batangas/nasugbu/{barangay}.html
     * https://www.openstreetmap.org/relation/7340421
     *
     * @var array<string, array{latitude: float, longitude: float}>
     */
    public const BARANGAY_COORDINATES = [
        'Aga' => ['latitude' => 14.0900, 'longitude' => 120.7792],
        'Balaytigui' => ['latitude' => 14.1260, 'longitude' => 120.6039],
        'Banilad' => ['latitude' => 14.0730, 'longitude' => 120.7408],
        'Bilaran' => ['latitude' => 14.0487, 'longitude' => 120.6846],
        'Bucana' => ['latitude' => 14.0678, 'longitude' => 120.6267],
        'Bulihan' => ['latitude' => 14.1552, 'longitude' => 120.6540],
        'Bunducan' => ['latitude' => 14.1069, 'longitude' => 120.6521],
        'Butucan' => ['latitude' => 14.1394, 'longitude' => 120.6805],
        'Calayo' => ['latitude' => 14.1461, 'longitude' => 120.6141],
        'Catandaan' => ['latitude' => 14.0804, 'longitude' => 120.6815],
        'Cogunan' => ['latitude' => 14.0625, 'longitude' => 120.6555],
        'Dayap' => ['latitude' => 14.1013, 'longitude' => 120.6627],
    ];

    /** @var array<int, string> */
    private const FARMER_FIRST_NAMES = [
        'Amelia', 'Berto', 'Carmela', 'Danilo', 'Elena', 'Florencio',
        'Gloria', 'Hector', 'Irene', 'Jonas', 'Lourdes', 'Mateo',
        'Nena', 'Orlando', 'Perla', 'Rogelio', 'Sonia', 'Teodoro',
    ];

    /** @var array<int, string> */
    private const FARMER_LAST_NAMES = [
        'Alonzo', 'Bautista', 'Cabrera', 'Dizon', 'Escalante', 'Gamboa',
        'Manalo', 'Magsino', 'Natividad', 'Panganiban', 'Salcedo', 'Villareal',
    ];

    public function run(): void
    {
        $districtId = app(DistrictAccess::class)->pilotId()
            ?? throw new \LogicException('Seed the configured pilot district before seeding reports.');
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
                $districtId,
            );
        }

        $this->seedVolume($reporter, $reviewer, $image, $districtId);
    }

    /**
     * @return array<string, int>
     */
    public static function volumeConfiguration(): array
    {
        $configuration = config('caneguard.seeders.dashboard', []);

        return [
            'months_back' => max(1, (int) ($configuration['months_back'] ?? 8)),
            'reports_per_barangay_per_condition' => max(
                1,
                (int) ($configuration['reports_per_barangay_per_condition'] ?? 2),
            ),
            'validation_spread' => max(2, (int) ($configuration['validation_spread'] ?? 5)),
            'closure_spread' => max(2, (int) ($configuration['closure_spread'] ?? 4)),
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function reportReferences(): array
    {
        return [
            ...self::REPORT_REFERENCES,
            ...array_keys(self::volumeDefinitions(self::volumeConfiguration())),
        ];
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
                'Aga',
                'Maribel Cordero',
                Report::LABEL_RUST,
                0.78,
                0.85,
                '2026-09-05 07:15:00',
                Report::STATUS_SUBMITTED_UNVERIFIED,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                null,
            ),
            'BGO-20260914-0830' => $this->attributes(
                '2a5f2d0c-45b0-4d1c-9c2e-819ad98ef012',
                'b8ddf31f-6348-4a2f-8d77-8a73e6f1b102',
                'Banilad',
                'Esteban Lacuesta',
                Report::LABEL_SMUT,
                0.86,
                1.2,
                '2026-09-14 08:30:00',
                Report::STATUS_FOR_FIELD_VALIDATION,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_ASSIGNED,
                Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                $reviewer,
                '2026-09-15 10:30:00',
            ),
            'BGO-20260925-0645' => $this->attributes(
                '7e0d4f37-6a08-42ed-9814-2cb6f5a4c013',
                '7abf2148-d89a-44d7-ae0f-18fa23d0c103',
                'Dayap',
                'Rosalinda Ybañez',
                Report::LABEL_MOSAIC,
                0.81,
                0.65,
                '2026-09-25 06:45:00',
                Report::STATUS_VERIFIED_BY_STAFF,
                Report::CASE_STATE_CLOSED,
                Report::VERIFICATION_OUTCOME_VERIFIED,
                Report::FIELD_VALIDATION_STATE_COMPLETED,
                Report::ACTION_NO_FURTHER_ACTION_REQUIRED,
                $reviewer,
                '2026-09-26 09:15:00',
            ),
            'BGO-20261003-0740' => $this->attributes(
                '49cb6d1e-2a45-48b7-9f60-3e0a7c5d1014',
                'e8a1d6f2-2405-49a5-b7f7-23b1d9ce4104',
                'Balaytigui',
                'Carmela Natividad',
                Report::LABEL_RUST,
                0.83,
                2.4,
                '2026-10-03 07:40:00',
                Report::STATUS_SUBMITTED_UNVERIFIED,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                null,
            ),
            'BGO-20261011-0910' => $this->attributes(
                '0cb2f8e3-7c2a-4f5f-a941-5a0e6d2b2015',
                '3ffb3b70-1d8d-4d2c-b3a0-11a4bcf0d205',
                'Bucana',
                'Mateo Villareal',
                Report::LABEL_SMUT,
                0.74,
                1.85,
                '2026-10-11 09:10:00',
                Report::STATUS_FOR_FIELD_VALIDATION,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_ASSIGNED,
                Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                $reviewer,
                '2026-10-12 13:10:00',
            ),
            'BGO-20261018-0630' => $this->attributes(
                'f2b3d6e4-8a1f-4e9a-bd62-6c4e7a3f3016',
                '9f6c0b4e-7e41-4f0f-9aa8-0a5b21d6e306',
                'Bilaran',
                'Lourdes Manansala',
                Report::LABEL_MOSAIC,
                0.9,
                0.95,
                '2026-10-18 06:30:00',
                Report::STATUS_VERIFIED_BY_STAFF,
                Report::CASE_STATE_CLOSED,
                Report::VERIFICATION_OUTCOME_VERIFIED,
                Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
                Report::ACTION_ADVISORY_PROVIDED,
                $reviewer,
                '2026-10-19 08:30:00',
            ),
            'BGO-20261024-0815' => $this->attributes(
                'a4e7c0f2-3b9d-4d8a-8f16-7c2e5b9a4017',
                '4c0d8e2a-70c9-4876-9ef4-3c2b1a7d4107',
                'Bulihan',
                'Benilda Soriano',
                Report::LABEL_HEALTHY,
                0.95,
                0.42,
                '2026-10-24 08:15:00',
                Report::STATUS_UNABLE_TO_VERIFY,
                Report::CASE_STATE_CLOSED,
                Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY,
                Report::FIELD_VALIDATION_STATE_COMPLETED,
                Report::ACTION_NO_FURTHER_ACTION_REQUIRED,
                $reviewer,
                '2026-10-25 11:45:00',
            ),
            'BGO-20261030-0705' => $this->attributes(
                '6f9a1d3c-5e7b-4a2f-8d90-1c3b6e8f5018',
                'd2b4f8e0-6a32-4d9c-9f73-5b1e0c7a5108',
                'Catandaan',
                'Omar de la Cruz',
                Report::LABEL_RUST,
                0.88,
                1.6,
                '2026-10-30 07:05:00',
                Report::STATUS_RESOLVED,
                Report::CASE_STATE_CLOSED,
                Report::VERIFICATION_OUTCOME_VERIFIED,
                Report::FIELD_VALIDATION_STATE_COMPLETED,
                Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                $reviewer,
                '2026-10-31 10:05:00',
            ),
            'BGO-20261106-0840' => $this->attributes(
                '1e5a8c3d-7f2b-4d90-a6e1-9c4b7f2d6019',
                '8a3f1c6e-2d9b-4e7a-b5f0-6c1e8d4a6109',
                'Bunducan',
                'Felisa Monteclaro',
                Report::LABEL_SMUT,
                0.7,
                1.1,
                '2026-11-06 08:40:00',
                Report::STATUS_SUBMITTED_UNVERIFIED,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
            ),
            'BGO-20261115-0720' => $this->attributes(
                'b7c4e1f9-3a6d-4f80-9e2b-5c7a1d8f7020',
                'f1d6b8a2-4e9c-4073-a5f0-2b7d9c6e7120',
                'Cogunan',
                'Nicanora Salcedo',
                Report::LABEL_MOSAIC,
                0.77,
                2.15,
                '2026-11-15 07:20:00',
                Report::STATUS_FOR_FIELD_VALIDATION,
                Report::CASE_STATE_OPEN,
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                Report::FIELD_VALIDATION_STATE_ASSIGNED,
                Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                $reviewer,
                '2026-11-16 09:20:00',
            ),
            'BGO-20261124-0900' => $this->attributes(
                'c2f5a8d1-6e3b-4f90-b7a2-1d9c5e8f8021',
                '5e0a3c7f-1d8b-4f6e-a2c9-7b4d0e5f8121',
                'Calayo',
                'Ramon Gaviola',
                Report::LABEL_HEALTHY,
                0.93,
                0.55,
                '2026-11-24 09:00:00',
                Report::STATUS_VERIFIED_BY_STAFF,
                Report::CASE_STATE_CLOSED,
                Report::VERIFICATION_OUTCOME_VERIFIED,
                Report::FIELD_VALIDATION_STATE_COMPLETED,
                Report::ACTION_ADVISORY_PROVIDED,
                $reviewer,
                '2026-11-25 12:00:00',
            ),
        ];
    }

    /**
     * Seed the high-volume dashboard fixture. The fixed records above retain
     * named workflow examples; stable report references update monthly coverage
     * in place on subsequent runs.
     */
    private function seedVolume(User $reporter, User $reviewer, string $image, int $districtId): void
    {
        $advisoryId = Advisory::query()
            ->where('code', RailwayDemoData::reference(AdvisorDemoSeeder::ADVISORY_CODE))
            ->value('id');
        $plan = self::volumeDefinitions(
            self::volumeConfiguration(),
            $reviewer->getKey(),
            $advisoryId === null ? null : (int) $advisoryId,
        );
        if (RailwayDemoData::active()) {
            $isolated = [];
            foreach ($plan as $reference => $definition) {
                $definition['report'] = RailwayDemoData::identities($reference, $definition['report']);
                $isolated[RailwayDemoData::reference($reference)] = $definition;
            }
            $plan = $isolated;
        }
        $references = array_keys($plan);
        $existingReports = Report::query()
            ->whereIn('reference_code', $references)
            ->get(['reference_code', 'uuid', 'client_uuid', 'scan_record_client_uuid'])
            ->keyBy('reference_code');
        $reportIds = [];

        foreach ($plan as $referenceCode => $definition) {
            $submittedAt = $definition['report']['submitted_at'];
            $path = self::volumeImagePath($submittedAt);
            $existing = $existingReports->get($referenceCode);
            $report = Report::withoutEvents(fn (): Report => Report::query()->updateOrCreate(
                ['reference_code' => $referenceCode],
                [
                    ...$definition['report'],
                    'uuid' => $existing?->uuid ?? $definition['report']['uuid'],
                    'client_uuid' => $existing?->client_uuid ?? $definition['report']['client_uuid'],
                    'scan_record_client_uuid' => $existing?->scan_record_client_uuid
                        ?? $definition['report']['scan_record_client_uuid'],
                    'reporter_id' => $reporter->getKey(),
                    'district_id' => $districtId,
                    'image_path' => $path,
                    'image_mime_type' => 'image/png',
                    'image_size_bytes' => strlen($image),
                    'image_source_type' => $definition['ordinal'] % 2 === 0 ? 'camera' : 'gallery',
                    'source_width' => 1254,
                    'source_height' => 1254,
                    'model_version' => 'v1.0-mobilenetv2',
                    'preprocess_ms' => 10 + ($definition['ordinal'] % 13),
                    'inference_ms' => 92 + ($definition['ordinal'] % 41),
                    'total_ms' => 126 + ($definition['ordinal'] % 47),
                    'captured_at' => $submittedAt->subMinutes(20),
                    'review_notes' => $definition['report']['reviewed_at'] === null
                        ? null
                        : 'Reviewed against the submitted field evidence.',
                    'lock_version' => 0,
                ],
            ));
            $reportIds[$referenceCode] = (int) $report->getKey();
        }

        $disk = Storage::disk('local');

        $reportImagePaths = [];
        foreach ($plan as $definition) {
            $path = self::volumeImagePath($definition['report']['submitted_at']);
            $reportImagePaths[$path] = true;
        }
        foreach (array_keys($reportImagePaths) as $path) {
            if (! $disk->exists($path) && ! $disk->put($path, $image)) {
                throw new RuntimeException("Unable to store report image [{$path}].");
            }
        }

        $labels = Report::v2Labels();
        foreach ($plan as $referenceCode => $definition) {
            $reportId = $reportIds[$referenceCode];
            $confidence = (float) $definition['report']['confidence'];
            foreach ($labels as $label) {
                ReportClassScore::query()->firstOrCreate(
                    ['report_id' => $reportId, 'label' => $label],
                    ['score' => $label === $definition['report']['predicted_label']
                        ? $confidence
                        : round((1 - $confidence) / (count($labels) - 1), 7)],
                );
            }

            ReportSymptom::query()->firstOrCreate([
                'report_id' => $reportId,
                'symptom_key' => $definition['report']['predicted_label'] === Report::LABEL_HEALTHY
                    ? 'none'
                    : $definition['report']['predicted_label'],
            ]);
            if ($definition['quality_warning']) {
                ReportQualityWarning::query()->firstOrCreate([
                    'report_id' => $reportId,
                    'warning_key' => 'low-resolution',
                ]);
            }
        }

        $assignmentDefinitions = [];
        foreach ($plan as $referenceCode => $definition) {
            if ($definition['assignment'] !== null && isset($reportIds[$referenceCode])) {
                $assignmentDefinitions[$referenceCode] = $definition['assignment'];
            }
        }
        $assignmentIds = [];
        if ($assignmentDefinitions !== []) {
            $assignmentReportIds = array_values(array_intersect_key(
                $reportIds,
                $assignmentDefinitions,
            ));
            $existingAssignments = DB::table('field_validation_assignments')
                ->whereIn('report_id', $assignmentReportIds)
                ->get(['report_id', 'uuid'])
                ->keyBy('report_id');

            foreach ($assignmentDefinitions as $referenceCode => $assignment) {
                $reportId = $reportIds[$referenceCode];
                $existing = $existingAssignments->get($reportId);
                $record = FieldValidationAssignment::query()->updateOrCreate(
                    ['report_id' => $reportId],
                    [
                        'uuid' => $existing?->uuid ?? (string) Str::uuid(),
                        'assignee_id' => $reporter->getKey(),
                        'assigned_by_id' => $reviewer->getKey(),
                        'target_visit_date' => $assignment['target_visit_date'],
                        'activated_at' => $assignment['activated_at'],
                    ],
                );
                $assignmentIds[$reportId] = (int) $record->getKey();
            }
        }

        $completionDefinitions = [];
        foreach ($plan as $referenceCode => $definition) {
            if ($definition['completion'] !== null && isset($reportIds[$referenceCode])) {
                $completionDefinitions[$referenceCode] = $definition['completion'];
            }
        }
        if ($completionDefinitions !== []) {
            $existingCompletions = DB::table('field_validation_completions')
                ->whereIn('assignment_id', array_values($assignmentIds))
                ->get(['assignment_id', 'uuid', 'client_uuid'])
                ->keyBy('assignment_id');
            $hasFollowUpOutcome = Schema::hasColumn(
                'field_validation_completions',
                'follow_up_outcome',
            );

            foreach ($completionDefinitions as $referenceCode => $completion) {
                $assignmentId = $assignmentIds[$reportIds[$referenceCode]] ?? null;
                if ($assignmentId === null) {
                    continue;
                }

                $existing = $existingCompletions->get($assignmentId);
                $row = [
                    'uuid' => $existing?->uuid ?? (string) Str::uuid(),
                    'client_uuid' => $existing?->client_uuid ?? (string) Str::uuid(),
                    'field_observation' => $completion['field_observation'],
                    'field_finding' => $completion['field_finding'],
                    'action_taken' => $completion['action_taken'],
                    'visited_at' => $completion['visited_at'],
                    'gps_outcome' => $completion['gps_outcome'],
                    'gps_attempted_at' => $completion['gps_attempted_at'],
                    'gps_latitude' => $completion['gps_latitude'],
                    'gps_longitude' => $completion['gps_longitude'],
                    'gps_accuracy' => $completion['gps_accuracy'],
                    'fresh_photo_path' => $completion['fresh_photo_path'],
                    'fresh_photo_mime_type' => $completion['fresh_photo_path'] === null
                        ? null
                        : 'image/png',
                    'fresh_photo_size_bytes' => $completion['fresh_photo_path'] === null
                        ? null
                        : strlen($image),
                ];
                if ($hasFollowUpOutcome) {
                    $row['follow_up_outcome'] = $completion['follow_up_outcome'];
                }
                FieldValidationCompletion::query()->updateOrCreate(
                    ['assignment_id' => $assignmentId],
                    $row,
                );
            }
        }

        $completionPhotoPaths = [];
        foreach ($completionDefinitions as $completion) {
            if ($completion['fresh_photo_path'] !== null) {
                $completionPhotoPaths[$completion['fresh_photo_path']] = true;
            }
        }
        foreach (array_keys($completionPhotoPaths) as $path) {
            if (! $disk->exists($path) && ! $disk->put($path, $image)) {
                throw new RuntimeException("Unable to store follow-up photo [{$path}].");
            }
        }

    }

    /**
     * Build deterministic records for each modeled month, barangay, condition,
     * and configured sample count. The generated values intentionally use the
     * same Nasugbu geography as the named fixtures and contain no demo labels.
     *
     * @return array<string, array<string, mixed>>
     */
    private static function volumeDefinitions(
        array $configuration,
        ?int $reviewerId = null,
        ?int $advisoryId = null,
    ): array {
        $now = CarbonImmutable::now('UTC');
        $anchorMonth = $now->startOfMonth();
        $labels = Report::v2Labels();
        $usedReferences = array_fill_keys(self::REPORT_REFERENCES, true);
        $definitions = [];
        $ordinal = 0;

        for ($monthOffset = 0; $monthOffset < $configuration['months_back']; $monthOffset++) {
            $month = $anchorMonth->subMonths($monthOffset);
            $daysAvailable = $month->daysInMonth;
            if ($month->isSameMonth($now)) {
                $daysAvailable = max(1, min($daysAvailable, $now->day - 1));
            }

            foreach (self::BARANGAYS as $barangayIndex => $barangay) {
                foreach ($labels as $conditionIndex => $label) {
                    for ($sample = 0; $sample < $configuration['reports_per_barangay_per_condition']; $sample++) {
                        $day = 1 + (($ordinal * 7 + $barangayIndex * 3 + $conditionIndex * 5 + $sample * 11) % $daysAvailable);
                        $submittedAt = $month
                            ->addDays($day - 1)
                            ->setTime(
                                6 + ($ordinal % 11),
                                ($ordinal * 13 + 15) % 60,
                            );
                        if ($submittedAt->gte($now)) {
                            $submittedAt = $now->subMinutes(30 + ($ordinal % 90));
                        }

                        $referenceCode = self::uniqueReference($submittedAt, $usedReferences);
                        $usedReferences[$referenceCode] = true;
                        $observedAt = $submittedAt->subMinutes(15 + ($ordinal % 30));
                        $coordinates = self::BARANGAY_COORDINATES[$barangay];
                        $latitude = round(
                            $coordinates['latitude'] + (($ordinal % 7) - 3) * 0.00025,
                            7,
                        );
                        $longitude = round(
                            $coordinates['longitude'] + (($ordinal % 9) - 4) * 0.00025,
                            7,
                        );
                        $closed = $ordinal % $configuration['closure_spread'] === 0;
                        $validationCycle = $ordinal % $configuration['validation_spread'];
                        $assignment = null;
                        $completion = null;
                        $reviewStatus = Report::STATUS_SUBMITTED_UNVERIFIED;
                        $caseState = Report::CASE_STATE_OPEN;
                        $verificationOutcome = Report::VERIFICATION_OUTCOME_NOT_DETERMINED;
                        $fieldValidationState = Report::FIELD_VALIDATION_STATE_UNASSIGNED;
                        $actionTaken = null;
                        $authorityCondition = null;

                        if ($closed) {
                            $closureKind = intdiv($ordinal, $configuration['closure_spread']) % 3;
                            $caseState = Report::CASE_STATE_CLOSED;
                            $fieldValidationState = Report::FIELD_VALIDATION_STATE_UNASSIGNED;
                            if ($closureKind === 0) {
                                $reviewStatus = Report::STATUS_VERIFIED_BY_STAFF;
                                $verificationOutcome = Report::VERIFICATION_OUTCOME_VERIFIED;
                                $actionTaken = Report::ACTION_ADVISORY_PROVIDED;
                                $authorityCondition = $label;
                            } elseif ($closureKind === 1) {
                                $reviewStatus = Report::STATUS_UNABLE_TO_VERIFY;
                                $verificationOutcome = Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY;
                                $actionTaken = Report::ACTION_NO_FURTHER_ACTION_REQUIRED;
                                $authorityCondition = Report::AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY;
                            } else {
                                $reviewStatus = Report::STATUS_RESOLVED;
                                $actionTaken = Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED;
                            }
                        } elseif ($validationCycle === 0) {
                            $reviewStatus = Report::STATUS_FOR_FIELD_VALIDATION;
                            $actionTaken = Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED;
                            $fieldValidationState = $ordinal % 2 === 0
                                ? Report::FIELD_VALIDATION_STATE_ASSIGNED
                                : Report::FIELD_VALIDATION_STATE_IN_PROGRESS;
                            $assignment = self::assignmentDefinition($submittedAt, $ordinal, false);
                        } elseif ($validationCycle === 1) {
                            $reviewStatus = Report::STATUS_FOR_FIELD_VALIDATION;
                            $actionTaken = Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED;
                            $fieldValidationState = Report::FIELD_VALIDATION_STATE_COMPLETED;
                            $assignment = self::assignmentDefinition($submittedAt, $ordinal, true);
                            $completion = self::completionDefinition(
                                $submittedAt,
                                $ordinal,
                                $latitude,
                                $longitude,
                            );
                        } elseif ($validationCycle === 2) {
                            $reviewStatus = Report::STATUS_FOR_FIELD_VALIDATION;
                            $actionTaken = Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED;
                        } elseif ($validationCycle === 3) {
                            $reviewStatus = Report::STATUS_SUBMITTED_UNVERIFIED;
                            $actionTaken = Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED;
                        }

                        $reviewedAt = $actionTaken === null
                            ? null
                            : $submittedAt->addHours(2 + ($ordinal % 9));
                        $advisorySelectedAt = null;
                        $advisoryDeliveredAt = null;
                        $advisoryAcknowledgedAt = null;
                        $reportAdvisoryId = null;
                        $advisoryDeliveryState = Report::ADVISORY_DELIVERY_NOT_SELECTED;
                        if ($advisoryId !== null && $actionTaken === Report::ACTION_ADVISORY_PROVIDED) {
                            $reportAdvisoryId = $advisoryId;
                            $advisorySelectedAt = $reviewedAt ?? $submittedAt->addHours(2);
                            $advisoryDeliveredAt = $advisorySelectedAt->addMinutes(2);
                            $advisoryDeliveryState = $ordinal % 2 === 0
                                ? Report::ADVISORY_DELIVERY_ACKNOWLEDGED
                                : Report::ADVISORY_DELIVERY_DELIVERED;
                            $advisoryAcknowledgedAt = $advisoryDeliveryState === Report::ADVISORY_DELIVERY_ACKNOWLEDGED
                                ? $advisoryDeliveredAt->addDay()
                                : null;
                        }

                        $report = [
                            'uuid' => (string) Str::uuid(),
                            'client_uuid' => (string) Str::uuid(),
                            'scan_record_client_uuid' => (string) Str::uuid(),
                            'barangay' => $barangay,
                            'farmer_or_farm_owner_name' => self::farmerName($ordinal),
                            'province' => 'Batangas',
                            'municipality' => 'Nasugbu',
                            'final_latitude' => $ordinal % 17 === 0 ? null : $latitude,
                            'final_longitude' => $ordinal % 17 === 0 ? null : $longitude,
                            'location_source' => $ordinal % 17 === 0
                                ? Report::LOCATION_SOURCE_UNAVAILABLE
                                : ($ordinal % 5 === 0
                                    ? Report::LOCATION_SOURCE_MANUAL_MAP
                                    : Report::LOCATION_SOURCE_GPS),
                            'location_unavailable_reason' => $ordinal % 17 === 0
                                ? Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP
                                : null,
                            'gps_accuracy' => $ordinal % 17 === 0 || $ordinal % 5 === 0
                                ? null
                                : round(3.5 + ($ordinal % 28) * 0.4, 2),
                            'observed_at' => $observedAt,
                            'submitted_at' => $submittedAt,
                            'sugarcane_variety' => ['PSR 86', 'Co 86032', 'Magsasaka 1'][$ordinal % 3],
                            'crop_age' => [
                                '4 months',
                                '6 months',
                                '8 months',
                                '10 months',
                            ][$ordinal % 4],
                            'cane_class' => ['Class A', 'Class B', 'Class C'][$ordinal % 3],
                            'affected_area_hectares' => round(
                                $label === Report::LABEL_HEALTHY
                                    ? 0.25 + ($ordinal % 6) * 0.08
                                    : 0.65 + ($ordinal % 17) * 0.19,
                                2,
                            ),
                            'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
                            'affected_portion_percent' => round(
                                $label === Report::LABEL_HEALTHY
                                    ? 4 + ($ordinal % 8)
                                    : 12 + ($ordinal % 61),
                                2,
                            ),
                            'affected_portion_measurement' => Report::MEASUREMENT_MEASURED,
                            'field_notes' => $label === Report::LABEL_HEALTHY
                                ? 'Rows remain evenly green with no visible lesion in the inspected block.'
                                : sprintf(
                                    'The %s pattern was recorded along the %s block for office follow-up.',
                                    $label,
                                    strtolower($barangay),
                                ),
                            'mismatch_reported' => $ordinal % 7 === 0,
                            'reporter_suspected_condition' => $label === Report::LABEL_HEALTHY
                                ? null
                                : ($ordinal % 4 === 0 ? Report::REPORTER_CONCERN_RSSI : $label),
                            'reporter_observation_text' => $label === Report::LABEL_HEALTHY
                                ? 'The grower observed uniform leaf color during the morning inspection.'
                                : sprintf(
                                    'The grower observed %s symptoms across a small group of rows.',
                                    $label,
                                ),
                            'predicted_label' => $label,
                            'confidence' => round(0.64 + ($ordinal % 29) * 0.011, 7),
                            'checklist_consistency' => ($ordinal % 6 === 0 ? 'inconclusive' : 'consistent'),
                            'reported_severity' => $label === Report::LABEL_HEALTHY
                                ? 'Mild'
                                : (($ordinal % 5 === 0 || $closed && $ordinal % 3 === 0)
                                    ? 'Severe'
                                    : 'Moderate'),
                            'review_status' => $reviewStatus,
                            'case_state' => $caseState,
                            'verification_outcome' => $verificationOutcome,
                            'field_validation_state' => $fieldValidationState,
                            'advisory_id' => $reportAdvisoryId,
                            'advisory_selected_by_id' => $reportAdvisoryId === null ? null : $reviewerId,
                            'advisory_selected_at' => $advisorySelectedAt,
                            'advisory_delivery_state' => $advisoryDeliveryState,
                            'advisory_delivered_at' => $advisoryDeliveredAt,
                            'advisory_acknowledged_at' => $advisoryAcknowledgedAt,
                            'action_taken' => $actionTaken,
                            'authority_classified_condition' => $authorityCondition,
                            'reviewer_id' => $reviewedAt === null ? null : $reviewerId,
                            'reviewed_at' => $reviewedAt,
                            'first_reviewed_at' => $reviewedAt === null
                                ? null
                                : $reviewedAt->subHours(1 + ($ordinal % 3)),
                        ];

                        $definitions[$referenceCode] = [
                            'ordinal' => $ordinal,
                            'report' => $report,
                            'assignment' => $assignment,
                            'completion' => $completion,
                            'quality_warning' => $ordinal % 9 === 0,
                        ];
                        $ordinal++;
                    }
                }
            }
        }

        return $definitions;
    }

    private static function uniqueReference(CarbonImmutable $submittedAt, array $used): string
    {
        $candidateAt = $submittedAt;
        do {
            $candidate = 'BGO-'.$candidateAt->format('Ymd-Hi');
            $candidateAt = $candidateAt->addMinute();
        } while (isset($used[$candidate]));

        return $candidate;
    }

    private static function volumeImagePath(CarbonImmutable $submittedAt): string
    {
        return RailwayDemoData::path('reports/'.$submittedAt->format('Y-m').'/dashboard-field-evidence.png');
    }

    private static function farmerName(int $ordinal): string
    {
        return self::FARMER_FIRST_NAMES[$ordinal % count(self::FARMER_FIRST_NAMES)]
            .' '.self::FARMER_LAST_NAMES[
                intdiv($ordinal, count(self::FARMER_FIRST_NAMES)) % count(self::FARMER_LAST_NAMES)
            ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function assignmentDefinition(
        CarbonImmutable $submittedAt,
        int $ordinal,
        bool $completed,
    ): array {
        $now = CarbonImmutable::now('UTC');
        if ($completed) {
            $target = $submittedAt->addDay();
        } elseif ($ordinal % 3 === 0) {
            $target = $now->subDays(2 + ($ordinal % 4));
        } else {
            $target = $now->addDays(1 + ($ordinal % 7));
        }

        return [
            'target_visit_date' => $target->toDateString(),
            'activated_at' => $submittedAt->addHours(2),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function completionDefinition(
        CarbonImmutable $submittedAt,
        int $ordinal,
        float $latitude,
        float $longitude,
    ): array {
        $visitedAt = $submittedAt->addDays(2)->addHours($ordinal % 5);
        $now = CarbonImmutable::now('UTC');
        if ($visitedAt->gte($now)) {
            $visitedAt = $now->subHours(2);
        }
        $photoPath = $ordinal % 3 === 0
            ? RailwayDemoData::path('field-validation/'.$visitedAt->format('Y-m').'/follow-up-evidence.png')
            : null;

        return [
            'field_observation' => 'The return visit recorded the condition across the marked rows.',
            'field_finding' => $ordinal % 4 === 0
                ? 'The affected area worsened and needs another office check.'
                : 'The monitored block is stable after the field visit.',
            'action_taken' => $ordinal % 4 === 0
                ? 'Marked the affected rows for renewed inspection.'
                : 'Reviewed sanitation steps with the grower and recorded the block for monitoring.',
            'visited_at' => $visitedAt,
            'gps_outcome' => $ordinal % 5 === 0 ? 'low_accuracy' : 'resolved',
            'gps_attempted_at' => $visitedAt->subMinutes(10),
            'gps_latitude' => $latitude,
            'gps_longitude' => $longitude,
            'gps_accuracy' => $ordinal % 5 === 0 ? 34.50 : round(4.5 + ($ordinal % 12), 2),
            'fresh_photo_path' => $photoPath,
            'follow_up_outcome' => ['improved', 'unchanged', 'worsened', 'unable_to_determine'][$ordinal % 4],
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
        ?string $actionTaken,
        ?User $reviewer = null,
        ?string $reviewedAt = null,
    ): array {
        $coordinates = self::BARANGAY_COORDINATES[$barangay];

        return [
            'uuid' => $uuid,
            'client_uuid' => $clientUuid,
            'barangay' => $barangay,
            'farmer_or_farm_owner_name' => $farmOwner,
            'province' => 'Batangas',
            'municipality' => 'Nasugbu',
            'final_latitude' => $coordinates['latitude'],
            'final_longitude' => $coordinates['longitude'],
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
            'field_notes' => 'Field evidence recorded during the municipal agriculture office survey.',
            'mismatch_reported' => false,
            'reporter_suspected_condition' => null,
            'reporter_observation_text' => 'The grower described the observed crop pattern during the morning survey.',
            'predicted_label' => $label,
            'confidence' => $confidence,
            'checklist_consistency' => $label === Report::LABEL_HEALTHY ? 'consistent' : 'inconclusive',
            'reported_severity' => $affectedArea > 2 ? 'Severe' : 'Moderate',
            'review_status' => $reviewStatus,
            'case_state' => $caseState,
            'verification_outcome' => $verificationOutcome,
            'field_validation_state' => $fieldValidationState,
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
     * @param  array<string, mixed>  $attributes
     */
    private function seedReport(
        string $referenceCode,
        array $attributes,
        User $reporter,
        string $image,
        int $districtId,
    ): Report {
        $attributes = RailwayDemoData::identities($referenceCode, $attributes);
        $referenceCode = RailwayDemoData::reference($referenceCode);
        $report = Report::withoutEvents(fn (): Report => Report::query()->updateOrCreate(
            ['reference_code' => $referenceCode],
            [
                ...$attributes,
                'reporter_id' => $reporter->getKey(),
                'district_id' => $districtId,
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
                    : 'Reviewed against the submitted field evidence.',
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
}
