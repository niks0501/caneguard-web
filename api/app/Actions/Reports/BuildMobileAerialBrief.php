<?php

namespace App\Actions\Reports;

use App\Models\ReportAerialAnalysis;
use GdImage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Builds and caches bounded JPEG derivatives for the Mobile Field Validation
 * aerial brief so phones never download raw 20 MiB desktop photos and always
 * stay well inside the 10 MiB per-file offline media cap.
 */
class BuildMobileAerialBrief
{
    public const MAX_EDGE_PX = 1600;

    public const JPEG_QUALITY = 82;

    /** CaneGuard --kpi-band-3 (#ae8a1b) problem-area highlight tint. */
    private const PROBLEM_TINT_R = 174;

    private const PROBLEM_TINT_G = 138;

    private const PROBLEM_TINT_B = 27;

    private const PROBLEM_TINT_ALPHA = 0.55;

    /**
     * @return list<string>
     */
    public static function derivativePaths(ReportAerialAnalysis $analysis): array
    {
        return [
            self::previewPath($analysis),
            self::overlayPath($analysis),
        ];
    }

    public static function previewPath(ReportAerialAnalysis $analysis): string
    {
        return "aerial/{$analysis->uuid}-mobile-preview.jpg";
    }

    public static function overlayPath(ReportAerialAnalysis $analysis): string
    {
        return "aerial/{$analysis->uuid}-mobile-overlay.jpg";
    }

    /**
     * @return array{preview_path: string, preview_bytes: int, overlay_path: string, overlay_bytes: int}|null
     */
    public function ensure(ReportAerialAnalysis $analysis): ?array
    {
        $disk = Storage::disk('local');
        $previewPath = self::previewPath($analysis);
        $overlayPath = self::overlayPath($analysis);

        if ($disk->exists($previewPath) && $disk->exists($overlayPath)) {
            return [
                'preview_path' => $previewPath,
                'preview_bytes' => (int) $disk->size($previewPath),
                'overlay_path' => $overlayPath,
                'overlay_bytes' => (int) $disk->size($overlayPath),
            ];
        }

        if (! $disk->exists($analysis->image_path) || ! $disk->exists($analysis->mask_path)) {
            return null;
        }

        if (! function_exists('imagecreatefromstring')) {
            Log::warning('PHP GD extension is unavailable for mobile aerial brief generation.');

            return null;
        }

        $source = null;
        $preview = null;
        $mask = null;
        $scaledMask = null;
        $overlay = null;

        try {
            $rawImage = $disk->get($analysis->image_path);
            $rawMask = $disk->get($analysis->mask_path);
            if (! is_string($rawImage) || ! is_string($rawMask)) {
                return null;
            }

            $source = @imagecreatefromstring($rawImage);
            $mask = @imagecreatefromstring($rawMask);
            if (! $source instanceof GdImage || ! $mask instanceof GdImage) {
                return null;
            }

            $source = $this->applyExifOrientation($source, $rawImage);
            $sourceWidth = imagesx($source);
            $sourceHeight = imagesy($source);
            if ($sourceWidth <= 0 || $sourceHeight <= 0) {
                return null;
            }

            [$targetWidth, $targetHeight] = $this->boundedDimensions($sourceWidth, $sourceHeight);
            $preview = imagecreatetruecolor($targetWidth, $targetHeight);
            if (! $preview instanceof GdImage) {
                return null;
            }
            imagecopyresampled(
                $preview,
                $source,
                0,
                0,
                0,
                0,
                $targetWidth,
                $targetHeight,
                $sourceWidth,
                $sourceHeight,
            );

            $previewBytes = $this->encodeJpeg($preview);
            if ($previewBytes === null) {
                return null;
            }

            // Use nearest-neighbor resize so class IDs (0, 1, 2) never blend into false edges.
            $scaledMask = imagecreatetruecolor($targetWidth, $targetHeight);
            if (! $scaledMask instanceof GdImage) {
                return null;
            }
            imagecopyresized(
                $scaledMask,
                $mask,
                0,
                0,
                0,
                0,
                $targetWidth,
                $targetHeight,
                imagesx($mask),
                imagesy($mask),
            );

            $overlay = imagecreatetruecolor($targetWidth, $targetHeight);
            if (! $overlay instanceof GdImage) {
                return null;
            }
            imagecopy($overlay, $preview, 0, 0, 0, 0, $targetWidth, $targetHeight);

            $keep = 1.0 - self::PROBLEM_TINT_ALPHA;
            $tintR = self::PROBLEM_TINT_R * self::PROBLEM_TINT_ALPHA;
            $tintG = self::PROBLEM_TINT_G * self::PROBLEM_TINT_ALPHA;
            $tintB = self::PROBLEM_TINT_B * self::PROBLEM_TINT_ALPHA;

            for ($y = 0; $y < $targetHeight; $y++) {
                for ($x = 0; $x < $targetWidth; $x++) {
                    $maskPixel = imagecolorat($scaledMask, $x, $y);
                    $classId = ($maskPixel >> 16) & 0xFF;
                    if ($classId !== 2) {
                        continue;
                    }
                    $rgb = imagecolorat($overlay, $x, $y);
                    $r = (int) round((($rgb >> 16) & 0xFF) * $keep + $tintR);
                    $g = (int) round((($rgb >> 8) & 0xFF) * $keep + $tintG);
                    $b = (int) round(($rgb & 0xFF) * $keep + $tintB);
                    imagesetpixel($overlay, $x, $y, ($r << 16) | ($g << 8) | $b);
                }
            }

            $overlayBytes = $this->encodeJpeg($overlay);
            if ($overlayBytes === null) {
                return null;
            }

            $disk->put($previewPath, $previewBytes);
            $disk->put($overlayPath, $overlayBytes);

            return [
                'preview_path' => $previewPath,
                'preview_bytes' => strlen($previewBytes),
                'overlay_path' => $overlayPath,
                'overlay_bytes' => strlen($overlayBytes),
            ];
        } catch (Throwable $failure) {
            Log::warning('Failed to build mobile aerial brief derivatives.', [
                'analysis_uuid' => $analysis->uuid,
                'failure_type' => $failure::class,
            ]);

            return null;
        } finally {
            foreach ([$source, $preview, $mask, $scaledMask, $overlay] as $resource) {
                if ($resource instanceof GdImage) {
                    imagedestroy($resource);
                }
            }
        }
    }

    /**
     * @return array{0: int, 1: int}
     */
    private function boundedDimensions(int $width, int $height): array
    {
        $longest = max($width, $height);
        if ($longest <= self::MAX_EDGE_PX) {
            return [$width, $height];
        }

        $scale = self::MAX_EDGE_PX / $longest;

        return [
            max(1, (int) round($width * $scale)),
            max(1, (int) round($height * $scale)),
        ];
    }

    private function applyExifOrientation(GdImage $image, string $rawBytes): GdImage
    {
        if (! function_exists('exif_read_data') || ! str_starts_with($rawBytes, "\xFF\xD8")) {
            return $image;
        }

        $stream = @fopen('php://memory', 'r+b');
        if ($stream === false) {
            return $image;
        }

        try {
            fwrite($stream, $rawBytes);
            rewind($stream);
            $exif = @exif_read_data($stream);
            $orientation = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;
        } finally {
            fclose($stream);
        }

        return match ($orientation) {
            2 => $this->flip($image, IMG_FLIP_HORIZONTAL),
            3 => $this->rotate($image, 180),
            4 => $this->flip($image, IMG_FLIP_VERTICAL),
            5 => $this->rotate($this->flip($image, IMG_FLIP_HORIZONTAL), 90),
            6 => $this->rotate($image, -90),
            7 => $this->rotate($this->flip($image, IMG_FLIP_HORIZONTAL), -90),
            8 => $this->rotate($image, 90),
            default => $image,
        };
    }

    private function flip(GdImage $image, int $mode): GdImage
    {
        imageflip($image, $mode);

        return $image;
    }

    private function rotate(GdImage $image, float $degrees): GdImage
    {
        $rotated = imagerotate($image, $degrees, 0);
        if (! $rotated instanceof GdImage) {
            return $image;
        }
        imagedestroy($image);

        return $rotated;
    }

    private function encodeJpeg(GdImage $image): ?string
    {
        ob_start();
        $ok = imagejpeg($image, null, self::JPEG_QUALITY);
        $bytes = ob_get_clean();

        return $ok && is_string($bytes) && $bytes !== '' ? $bytes : null;
    }
}
