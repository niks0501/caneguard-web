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
                'scan_record_client_uuid' => $data['scan_record_client_uuid'] ?? null,
                'barangay' => $data['barangay'],
                'farmer_or_farm_owner_name' => $data['farmer_or_farm_owner_name'] ?? null,
                'province' => $data['province'] ?? null,
                'municipality' => $data['municipality'] ?? null,
                'sugarcane_variety' => $data['sugarcane_variety'] ?? null,
                'crop_age' => $data['crop_age'] ?? null,
                'cane_class' => $data['cane_class'] ?? null,
                'affected_area_hectares' => $data['affected_area_hectares'] ?? null,
                'affected_portion_percent' => $data['affected_portion_percent'] ?? null,
                'field_notes' => $data['field_notes'] ?? null,
                'mismatch_reported' => $data['mismatch_reported'] ?? null,
                'reporter_suspected_condition' => $data['reporter_suspected_condition'] ?? null,
                'reporter_observation_text' => $data['reporter_observation_text'] ?? null,
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
                'final_latitude' => $data['final_latitude'] ?? null,
                'final_longitude' => $data['final_longitude'] ?? null,
                'location_source' => $data['location_source'] ?? null,
                'gps_accuracy' => $data['gps_accuracy'] ?? null,
                'observed_at' => isset($data['observed_at'])
                    ? CarbonImmutable::parse($data['observed_at'])->utc()
                    : null,
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
