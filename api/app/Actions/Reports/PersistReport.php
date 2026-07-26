<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

class PersistReport
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function handle(
        User $reporter,
        array $data,
        UploadedFile $image,
        string $uuid,
        string $path,
        string $referenceCode,
    ): Report {
        return DB::transaction(function () use (
            $reporter,
            $data,
            $image,
            $uuid,
            $path,
            $referenceCode,
        ) {
            $report = Report::query()->create([
                'uuid' => $uuid,
                'reference_code' => $referenceCode,
                'reporter_id' => $reporter->getKey(),
                'client_uuid' => $data['client_uuid'],
                'barangay' => $data['barangay'],
                'image_path' => $path,
                'image_mime_type' => $image->getMimeType() ?: 'application/octet-stream',
                'image_size_bytes' => $image->getSize(),
                'image_source_type' => $data['image_source_type'],
                'source_width' => $data['source_width'] ?? null,
                'source_height' => $data['source_height'] ?? null,
                'predicted_label' => $data['predicted_label'],
                'confidence' => $data['confidence'],
                'checklist_consistency' => $data['checklist_consistency'],
                'reported_severity' => $data['reported_severity'] ?? null,
                'model_version' => $data['model_version'],
                'preprocess_ms' => $data['preprocess_ms'],
                'inference_ms' => $data['inference_ms'],
                'total_ms' => $data['total_ms'],
                'captured_at' => CarbonImmutable::parse(
                    $data['captured_at'],
                )->utc(),
                'submitted_at' => now()->utc(),
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            ]);

            $report->classScores()->createMany(
                collect($data['class_scores'])
                    ->map(fn (float|int|string $score, string $label) => [
                        'label' => $label,
                        'score' => $score,
                    ])
                    ->values()
                    ->all(),
            );
            $report->symptoms()->createMany(
                collect($data['symptom_keys'])
                    ->map(fn (string $key) => ['symptom_key' => $key])
                    ->all(),
            );
            $report->qualityWarnings()->createMany(
                collect($data['quality_warnings'])
                    ->map(fn (string $key) => ['warning_key' => $key])
                    ->all(),
            );

            return $report;
        }, attempts: 3);
    }
}
