<?php

namespace Database\Seeders;

use App\Models\Report;
use App\Models\ReportClassScore;
use App\Models\ReportQualityWarning;
use App\Models\ReportSymptom;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class ReportSeeder extends Seeder
{
    public function run(): void
    {
        $reporter = User::query()
            ->where('email', 'field@caneguard.test')
            ->firstOrFail();
        $reviewer = User::query()
            ->where('email', 'mao@caneguard.test')
            ->firstOrFail();
        $image = file_get_contents(
            database_path(
                'seeders/assets/synthetic-sugarcane-rust.png',
            ),
        );

        if (! is_string($image)) {
            throw new RuntimeException('The report image asset is invalid.');
        }

        $statuses = Report::reviewStatuses();
        // Seed the current Model V1 evidence shape so monitoring exercises every
        // prediction class, including Smut, without changing the legacy upload
        // contract.
        $labels = Report::v2Labels();
        $barangays = [
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
        $farmOwners = [
            'Nicanor Paredes',
            'Sonia Villareal',
            'Ruben Magbanua',
            'Celia Magsino',
            'Orlando Yulo',
            'Leticia Araneta',
            'Benito Salazar',
            'Rosario Madamba',
            'Edgardo Sarmiento',
            'Milagros Natividad',
            'Hernando Ledesma',
            'Alma Quijano',
        ];
        $reportUuids = [
            '9d1e35c6-574e-4110-9dc2-400dab8579c0',
            'c856b8a8-2311-4262-8827-ebe142ff27be',
            '64512728-8ff4-4665-9bb7-8ae342fea361',
            '057f1bef-96cd-4f41-8393-3d24915c4f74',
            'c6ffa35a-340b-4cb7-85a8-74655c48d537',
            'c281612c-8b18-49c2-87ce-c8e74b2ca8b5',
            'ac3b33e5-f7ff-459d-b618-b0a8d1d892d1',
            '059a740b-7edc-4bfb-a426-71da69fdc6d5',
            '0549b608-b853-4b03-a4e9-08b0a8db8cea',
            '1af08c1e-4d44-4fa3-8902-099342ef6c3e',
            '076c799a-a378-4a2d-95aa-b3d6774242f0',
            '65be392b-0177-4354-85ea-839018229520',
        ];
        $clientUuids = [
            'c93939fc-601e-42b3-8d30-c786b2402f78',
            '4d160c38-ccdb-41ce-ae2c-9a48b3aed12b',
            'ac463d95-9cac-4fa9-b149-6b280c45ede8',
            'c4b55daf-af8f-455e-a3e2-79afa4ff328b',
            '10369f55-2a9f-4b89-b793-e9f11540e85d',
            'c476c8b6-857f-4d8b-aeed-f4f4b7cdaf0d',
            '115b2671-5589-4e22-8448-688eef1ec002',
            '41add557-c6f7-4fe2-befb-db814e5619b4',
            'd6b32724-4d34-45bb-a20d-778e946c7965',
            'd9b78333-235a-4364-ab65-5ca6aa8636cf',
            '59b73792-4dff-4293-866d-0f6ca8442cc0',
            '250d7001-6d71-44f5-af64-057e4529515b',
        ];
        // Reference points are from the corresponding Nasugbu barangay maps;
        // null entries preserve reports without a valid location.
        $locations = [
            1 => null,
            2 => ['latitude' => 14.1260, 'longitude' => 120.6039, 'source' => 'gps', 'accuracy' => 4.2],
            3 => null,
            4 => null,
            5 => null,
            6 => null,
            7 => ['latitude' => 14.1069, 'longitude' => 120.6521, 'source' => 'manual_map', 'accuracy' => null],
            8 => null,
            9 => null,
            10 => null,
            11 => null,
            12 => null,
        ];

        foreach (range(1, 12) as $number) {
            $location = $locations[$number];
            $label = $labels[($number - 1) % count($labels)];
            $status = $statuses[($number - 1) % count($statuses)];
            $submittedAt = CarbonImmutable::create(
                2026,
                7,
                1 + $number,
                8 + ($number % 8),
                15,
                0,
                'UTC',
            );
            $referenceCode = sprintf('BGO-%s', $submittedAt->format('Ymd-Hi'));
            $path = sprintf('reports/2026-07/%s.png', strtolower($referenceCode));
            $clientUuid = $clientUuids[$number - 1];
            $reportUuid = $reportUuids[$number - 1];
            $farmerOrFarmOwnerName = $farmOwners[$number - 1];
            $confidence = round(0.62 + ($number * 0.025), 7);
            $capturedAt = $submittedAt->subMinutes(20 + $number);

            DB::transaction(function () use (
                $referenceCode,
                $clientUuid,
                $reportUuid,
                $reporter,
                $reviewer,
                $location,
                $barangays,
                $farmerOrFarmOwnerName,
                $number,
                $status,
                $path,
                $label,
                $confidence,
                $submittedAt,
                $capturedAt,
                $image,
            ): void {
                $report = Report::withoutEvents(fn (): Report => Report::query()->updateOrCreate(
                    ['reference_code' => $referenceCode],
                    [
                        'uuid' => $reportUuid,
                        'reporter_id' => $reporter->getKey(),
                        'client_uuid' => $clientUuid,
                        'barangay' => $barangays[($number - 1) % count($barangays)],
                        'farmer_or_farm_owner_name' => $farmerOrFarmOwnerName,
                        'province' => 'Batangas',
                        'municipality' => 'Nasugbu',
                        'final_latitude' => $location['latitude'] ?? null,
                        'final_longitude' => $location['longitude'] ?? null,
                        'location_source' => $location['source']
                            ?? Report::LOCATION_SOURCE_UNAVAILABLE,
                        'location_unavailable_reason' => $location === null
                            ? Report::LOCATION_UNAVAILABLE_REASON_OTHER
                            : null,
                        'gps_accuracy' => $location['accuracy'] ?? null,
                        'image_path' => $path,
                        'image_mime_type' => 'image/png',
                        'image_size_bytes' => strlen($image),
                        'image_source_type' => $number % 2 === 0 ? 'gallery' : 'camera',
                        'source_width' => 1254,
                        'source_height' => 1254,
                        'predicted_label' => $label,
                        'confidence' => $confidence,
                        'checklist_consistency' => $number % 4 === 0
                            ? 'inconclusive'
                            : 'consistent',
                        'reported_severity' => ['Mild', 'Moderate', 'Severe'][($number - 1) % 3],
                        'affected_area_measurement' => Report::MEASUREMENT_NOT_MEASURED,
                        'affected_portion_measurement' => Report::MEASUREMENT_NOT_MEASURED,
                        'model_version' => 'v1.0-mobilenetv2',
                        'preprocess_ms' => 10 + $number,
                        'inference_ms' => 90 + ($number * 3),
                        'total_ms' => 120 + ($number * 4),
                        'captured_at' => $capturedAt,
                        'observed_at' => $capturedAt,
                        'submitted_at' => $submittedAt,
                        'review_status' => $status,
                        ...Report::lifecycleForReviewStatus($status),
                        'review_notes' => $status === Report::STATUS_SUBMITTED_UNVERIFIED
                            ? null
                            : 'Reviewed by the municipal agriculture office.',
                        'reviewer_id' => $status === Report::STATUS_SUBMITTED_UNVERIFIED
                            ? null
                            : $reviewer->getKey(),
                        'reviewed_at' => $status === Report::STATUS_SUBMITTED_UNVERIFIED
                            ? null
                            : $submittedAt->addDay(),
                    ],
                ));

                $disk = Storage::disk('local');
                if (($report->wasRecentlyCreated || ! $disk->exists($report->image_path))
                    && ! $disk->put($report->image_path, $image)) {
                    throw new RuntimeException("Unable to store report image [{$path}].");
                }

                $reportLabels = $report->model_version === 'v1.0-mobilenetv2'
                    ? Report::v2Labels()
                    : Report::labels();
                $reportConfidence = (float) $report->confidence;
                foreach ($reportLabels as $scoreLabel) {
                    $score = $scoreLabel === $report->predicted_label
                        ? $reportConfidence
                        : round((1 - $reportConfidence) / (count($reportLabels) - 1), 7);

                    ReportClassScore::query()->firstOrCreate(
                        ['report_id' => $report->getKey(), 'label' => $scoreLabel],
                        ['score' => $score],
                    );
                }

                $symptomKey = $report->predicted_label === Report::LABEL_HEALTHY
                    ? 'none'
                    : $report->predicted_label;
                ReportSymptom::query()->firstOrCreate([
                    'report_id' => $report->getKey(),
                    'symptom_key' => $symptomKey,
                ]);

                if ($number % 3 === 0) {
                    ReportQualityWarning::query()->firstOrCreate([
                        'report_id' => $report->getKey(),
                        'warning_key' => 'low-resolution',
                    ]);
                }
            });
        }
    }
}
