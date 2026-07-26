<?php

namespace Database\Seeders;

use App\Models\Report;
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
            throw new RuntimeException('The seeded report image is invalid.');
        }

        $statuses = Report::reviewStatuses();
        $labels = Report::labels();
        $barangays = [
            'Mabini',
            'Maligaya',
            'Poblacion',
            'San Isidro',
            'San Roque',
        ];

        foreach (range(1, 12) as $number) {
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
            $path = sprintf('seeded/report-%02d.png', $number);

            if (! Storage::disk('local')->put($path, $image)) {
                throw new RuntimeException("Unable to seed report image [{$path}].");
            }

            $confidence = round(0.62 + ($number * 0.025), 7);
            $report = Report::query()->updateOrCreate(
                ['reference_code' => sprintf('CG-2026-%04d', $number)],
                [
                    'uuid' => sprintf(
                        '20000000-0000-4000-8000-%012d',
                        $number,
                    ),
                    'reporter_id' => $reporter->getKey(),
                    'client_uuid' => sprintf(
                        '30000000-0000-4000-8000-%012d',
                        $number,
                    ),
                    'barangay' => $barangays[($number - 1) % count($barangays)],
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
                    'reported_severity' => ['low', 'moderate', 'high'][($number - 1) % 3],
                    'model_version' => 'caneguard-mobile-v1.0.0',
                    'preprocess_ms' => 10 + $number,
                    'inference_ms' => 90 + ($number * 3),
                    'total_ms' => 120 + ($number * 4),
                    'captured_at' => $submittedAt->subMinutes(20 + $number),
                    'submitted_at' => $submittedAt,
                    'review_status' => $status,
                    'review_notes' => $status === Report::STATUS_SUBMITTED_UNVERIFIED
                        ? null
                        : 'Seeded office review for demonstration.',
                    'reviewer_id' => $status === Report::STATUS_SUBMITTED_UNVERIFIED
                        ? null
                        : $reviewer->getKey(),
                    'reviewed_at' => $status === Report::STATUS_SUBMITTED_UNVERIFIED
                        ? null
                        : $submittedAt->addDay(),
                ],
            );

            foreach (Report::labels() as $scoreLabel) {
                $score = $scoreLabel === $label
                    ? $confidence
                    : round((1 - $confidence) / 2, 7);

                DB::table('report_class_scores')->updateOrInsert(
                    [
                        'report_id' => $report->getKey(),
                        'label' => $scoreLabel,
                    ],
                    ['score' => $score],
                );
            }

            DB::table('report_symptoms')->updateOrInsert([
                'report_id' => $report->getKey(),
                'symptom_key' => $label === Report::LABEL_HEALTHY
                    ? 'none'
                    : $label,
            ]);

            if ($number % 3 === 0) {
                DB::table('report_quality_warnings')->updateOrInsert([
                    'report_id' => $report->getKey(),
                    'warning_key' => 'low-resolution',
                ]);
            }
        }
    }
}
