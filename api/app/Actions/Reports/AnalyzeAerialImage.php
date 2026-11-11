<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\ReportAerialAnalysis;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

/**
 * Stores one aerial photo privately, runs the one-shot ONNX segmentation
 * synchronously and records the canopy shares. Nothing here touches the
 * report's GPS, polygon, loss-rate or review fields.
 */
class AnalyzeAerialImage
{
    private const LOCK_KEY = 'aerial-analysis';

    public function handle(Report $report, User $uploader, UploadedFile $image): ReportAerialAnalysis
    {
        $lock = Cache::lock(self::LOCK_KEY, $this->timeout() + 30);
        abort_unless($lock->get(), 429, 'Another aerial check is running. Try again shortly.');

        $disk = Storage::disk('local');
        $uuid = (string) Str::uuid7();
        $imagePath = null;
        $maskPath = "aerial/{$uuid}-mask.png";

        try {
            $imagePath = $disk->putFileAs(
                'aerial',
                $image,
                $uuid.'.'.($image->guessExtension() ?: 'bin'),
            );
            if (! is_string($imagePath)) {
                throw new RuntimeException('The aerial image could not be stored.');
            }

            $result = $this->segment($disk->path($imagePath), $disk->path($maskPath));
            if (! $disk->exists($maskPath)) {
                throw new RuntimeException('The segmentation produced no mask.');
            }

            return DB::transaction(fn () => ReportAerialAnalysis::query()->create([
                'uuid' => $uuid,
                'report_id' => $report->getKey(),
                'uploaded_by' => $uploader->getKey(),
                'image_path' => $imagePath,
                'image_mime_type' => (string) $image->getMimeType(),
                'image_size_bytes' => (int) $image->getSize(),
                'image_width' => $result['image_width'],
                'image_height' => $result['image_height'],
                'mask_path' => $maskPath,
                'mask_width' => $result['mask_width'],
                'mask_height' => $result['mask_height'],
                'normal_canopy_percent' => $result['normal_canopy_percent'],
                'abnormal_canopy_percent' => $result['abnormal_canopy_percent'],
                'canopy_coverage_percent' => $result['canopy_coverage_percent'],
                'model_version' => (string) config('caneguard.aerial.model_version'),
                'weights_sha256' => $result['model_sha256'],
                'inference_ms' => $result['inference_ms'],
            ]));
        } catch (Throwable $failure) {
            $this->deleteFiles(array_filter([$imagePath, $maskPath]), $failure);
            Log::warning('Aerial analysis failed.', ['failure_type' => $failure::class]);

            throw new HttpException(503, 'The aerial check is unavailable right now. Nothing was saved.');
        } finally {
            $lock->release();
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function segment(string $imagePath, string $maskPath): array
    {
        $model = config('caneguard.aerial.model_path');
        $pinned = $this->pinnedSha();
        if (! is_string($model) || $model === '' || $pinned === null) {
            throw new RuntimeException('The aerial model is not configured.');
        }

        $run = Process::timeout($this->timeout())->run([
            (string) config('caneguard.aerial.python'),
            base_path('../aerial-inference/segment.py'),
            '--model', $model,
            '--image', $imagePath,
            '--mask-out', $maskPath,
            '--sha256', $pinned,
        ]);
        if (! $run->successful()) {
            throw new RuntimeException('The segmentation process failed.');
        }

        return $this->validated(json_decode($run->output(), true), $pinned);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(mixed $output, string $pinned): array
    {
        if (! is_array($output)) {
            throw new RuntimeException('The segmentation output was not JSON.');
        }

        foreach (['image_width', 'image_height', 'mask_width', 'mask_height', 'inference_ms'] as $key) {
            if (! is_int($output[$key] ?? null) || $output[$key] < 0) {
                throw new RuntimeException("The segmentation output has an invalid {$key}.");
            }
        }
        $shares = [];
        foreach (['normal_canopy_percent', 'abnormal_canopy_percent', 'canopy_coverage_percent'] as $key) {
            $value = $output[$key] ?? null;
            if ((! is_int($value) && ! is_float($value)) || $value < 0 || $value > 100) {
                throw new RuntimeException("The segmentation output has an invalid {$key}.");
            }
            $shares[$key] = round((float) $value, 2);
        }
        $sum = $shares['normal_canopy_percent'] + $shares['abnormal_canopy_percent'];
        if ($shares['canopy_coverage_percent'] > 0 && abs($sum - 100) > 0.1) {
            throw new RuntimeException('The canopy shares do not add up to the visible canopy.');
        }
        if (! is_string($output['model_sha256'] ?? null) || ! hash_equals($pinned, $output['model_sha256'])) {
            throw new RuntimeException('The segmentation used an unpinned model.');
        }

        return [...$output, ...$shares];
    }

    private function pinnedSha(): ?string
    {
        $configured = config('caneguard.aerial.weights_sha256');
        if (! is_string($configured) || $configured === '') {
            $file = base_path('../aerial-inference/model.onnx.sha256');
            $configured = is_file($file) ? (preg_split('/\s+/', trim((string) file_get_contents($file)))[0] ?? '') : '';
        }
        $configured = strtolower($configured);

        return preg_match('/^[0-9a-f]{64}$/', $configured) === 1 ? $configured : null;
    }

    private function timeout(): int
    {
        return (int) config('caneguard.aerial.timeout_seconds', 60);
    }

    /**
     * @param  array<int, string>  $paths
     */
    private function deleteFiles(array $paths, Throwable $original): void
    {
        foreach ($paths as $path) {
            try {
                if (Storage::disk('local')->exists($path) && ! Storage::disk('local')->delete($path)) {
                    Log::critical('Failed aerial analysis left an orphaned file.', [
                        'path' => $path,
                        'failure_type' => $original::class,
                    ]);
                }
            } catch (Throwable) {
                Log::critical('Aerial analysis cleanup raised an exception.', [
                    'path' => $path,
                    'failure_type' => $original::class,
                ]);
            }
        }
    }
}
