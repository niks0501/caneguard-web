<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class StoreReport
{
    public function __construct(
        private readonly PersistReport $persistReport,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @return array{report: Report, created: bool}
     */
    public function handle(User $reporter, array $data, UploadedFile $image): array
    {
        $existing = $this->findExisting($reporter, $data['client_uuid']);

        if ($existing) {
            return ['report' => $existing, 'created' => false];
        }

        $uuid = (string) Str::uuid7();
        $extension = $image->guessExtension() ?: 'bin';
        $path = Storage::disk('local')->putFileAs(
            'reports',
            $image,
            "{$uuid}.{$extension}",
        );

        if (! is_string($path)) {
            throw new RuntimeException('The report image could not be stored.');
        }

        try {
            $report = $this->persistReport->handle(
                $reporter,
                $data,
                $image,
                $uuid,
                $path,
                $this->referenceCode($uuid),
            );
        } catch (UniqueConstraintViolationException $exception) {
            $this->deleteFailedUpload($path, $exception);

            $existing = $this->findExisting($reporter, $data['client_uuid']);

            if ($existing) {
                return ['report' => $existing, 'created' => false];
            }

            throw $exception;
        } catch (Throwable $exception) {
            $this->deleteFailedUpload($path, $exception);

            throw $exception;
        }

        return [
            'report' => $this->load($report),
            'created' => true,
        ];
    }

    private function findExisting(User $reporter, string $clientUuid): ?Report
    {
        $report = Report::query()
            ->whereBelongsTo($reporter, 'reporter')
            ->where('client_uuid', $clientUuid)
            ->first();

        return $report ? $this->load($report) : null;
    }

    private function load(Report $report): Report
    {
        return $report->load([
            'reporter',
            'reviewer',
            'classScores',
            'symptoms',
            'qualityWarnings',
        ]);
    }

    private function referenceCode(string $uuid): string
    {
        $suffix = Str::upper(Str::substr(str_replace('-', '', $uuid), -8));

        return 'CG-'.now()->utc()->format('Ymd')."-{$suffix}";
    }

    private function deleteFailedUpload(string $path, Throwable $original): void
    {
        try {
            $deleted = Storage::disk('local')->delete($path);

            if (! $deleted) {
                Log::critical('Failed report upload left an orphaned image.', [
                    'image_path' => $path,
                    'failure_type' => $original::class,
                ]);
            }
        } catch (Throwable $cleanup) {
            Log::critical('Report upload image cleanup raised an exception.', [
                'image_path' => $path,
                'failure_type' => $original::class,
                'cleanup_failure_type' => $cleanup::class,
            ]);
        }
    }
}
