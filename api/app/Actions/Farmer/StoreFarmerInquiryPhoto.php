<?php

namespace App\Actions\Farmer;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * An untrusted farmer photo becomes a fresh JPEG on the private disk. The
 * bytes are sniffed rather than trusted, bounded, and re-encoded, which drops
 * EXIF (including GPS) and anything hidden after the image data.
 */
final class StoreFarmerInquiryPhoto
{
    public const MAX_BYTES = 5 * 1024 * 1024;

    public const MAX_SIDE = 8000;

    public const MAX_PIXELS = 40_000_000;

    private const ALLOWED = ['image/jpeg' => IMAGETYPE_JPEG, 'image/png' => IMAGETYPE_PNG, 'image/webp' => IMAGETYPE_WEBP];

    /** @return array{path: string, mime_type: string, size_bytes: int} */
    public function handle(UploadedFile $file, string $inquiryUuid, int $position): array
    {
        abort_unless(function_exists('imagecreatefromstring') && function_exists('imagejpeg'), 503, 'Photo processing is unavailable.');

        $bytes = $file->isValid() && $file->getSize() !== false && $file->getSize() <= self::MAX_BYTES
            ? file_get_contents($file->getRealPath())
            : false;
        if ($bytes === false || $bytes === '' || strlen($bytes) > self::MAX_BYTES) {
            throw $this->invalid('The photo must be an image of 5 MB or less.');
        }

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        $info = @getimagesizefromstring($bytes);
        if (! is_string($mime) || ! isset(self::ALLOWED[$mime]) || $info === false || $info[2] !== self::ALLOWED[$mime]) {
            throw $this->invalid('Only JPEG, PNG or WebP photos are accepted.');
        }
        [$width, $height] = $info;
        if ($width < 1 || $height < 1 || $width > self::MAX_SIDE || $height > self::MAX_SIDE || $width * $height > self::MAX_PIXELS) {
            throw $this->invalid('The photo is too large to process.');
        }

        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            throw $this->invalid('The photo could not be read.');
        }
        $image = $this->upright($image, $mime, $bytes);
        $flat = imagecreatetruecolor(imagesx($image), imagesy($image));
        imagefill($flat, 0, 0, (int) imagecolorallocate($flat, 255, 255, 255));
        imagecopy($flat, $image, 0, 0, 0, 0, imagesx($image), imagesy($image));
        ob_start();
        imagejpeg($flat, null, 85);
        $jpeg = (string) ob_get_clean();
        if ($jpeg === '') {
            throw $this->invalid('The photo could not be processed.');
        }

        $path = "farmer-inquiries/{$inquiryUuid}/{$position}-".Str::random(24).'.jpg';
        abort_unless(Storage::disk('local')->put($path, $jpeg), 500, 'The photo could not be stored.');

        return ['path' => $path, 'mime_type' => 'image/jpeg', 'size_bytes' => strlen($jpeg)];
    }

    /** Applies the camera's rotation before the metadata that carries it is dropped. */
    private function upright(\GdImage $image, string $mime, string $bytes): \GdImage
    {
        if ($mime !== 'image/jpeg' || ! function_exists('exif_read_data')) {
            return $image;
        }
        $exif = @exif_read_data('data://image/jpeg;base64,'.base64_encode($bytes));
        $angle = match ((int) ($exif['Orientation'] ?? 1)) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };

        return $angle === 0 ? $image : (imagerotate($image, $angle, 0) ?: $image);
    }

    private function invalid(string $message): ValidationException
    {
        return ValidationException::withMessages(['photos' => [$message]]);
    }
}
