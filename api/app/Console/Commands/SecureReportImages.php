<?php

namespace App\Console\Commands;

use App\Models\Report;
use Illuminate\Console\Command;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Throwable;

class SecureReportImages extends Command
{
    protected $signature = 'reports:secure-images
        {--remove-public : Delete verified public copies and remove the legacy web symlink}';

    protected $description = 'Copy report evidence to private storage and optionally remove public access';

    public function handle(): int
    {
        $private = Storage::disk('local');
        $public = Storage::disk('public');
        $verifiedPublicPaths = [];
        $failed = false;

        if (
            $this->option('remove-public')
            && ! $this->legacyLinkIsSafe($public)
        ) {
            return self::FAILURE;
        }

        try {
            Report::query()
                ->select(['id', 'reference_code', 'image_path'])
                ->orderBy('id')
                ->eachById(function (Report $report) use (
                    $private,
                    $public,
                    &$verifiedPublicPaths,
                    &$failed,
                ): void {
                    $path = $report->image_path;

                    if (! $this->isSafeReportPath($path)) {
                        $this->error(
                            "{$report->reference_code}: unsafe image path; skipped.",
                        );
                        $failed = true;

                        return;
                    }

                    if (! $private->exists($path)) {
                        if (! $public->exists($path)) {
                            $this->error(
                                "{$report->reference_code}: image is missing from both disks.",
                            );
                            $failed = true;

                            return;
                        }

                        if (! $private->put($path, $public->get($path))) {
                            $this->error(
                                "{$report->reference_code}: private copy failed.",
                            );
                            $failed = true;

                            return;
                        }
                    }

                    if ($public->exists($path)) {
                        if (! $this->filesMatch($private, $public, $path)) {
                            $this->error(
                                "{$report->reference_code}: public and private images differ.",
                            );
                            $failed = true;

                            return;
                        }

                        $verifiedPublicPaths[$path] = true;
                    }

                    $this->line(
                        "{$report->reference_code}: private image verified.",
                    );
                });
        } catch (Throwable $exception) {
            $this->error(
                'Report image migration could not inspect all records ('.
                $exception::class.').',
            );
            $failed = true;
        }

        if ($failed) {
            $this->warn(
                'No public files or links were removed. Correct the errors and rerun.',
            );

            return self::FAILURE;
        }

        if (! $this->option('remove-public')) {
            $this->info(
                'Private copies are ready. Rerun with --remove-public after verification.',
            );

            return self::SUCCESS;
        }

        foreach (array_keys($verifiedPublicPaths) as $path) {
            if (! $public->delete($path)) {
                $this->error("Could not remove public image [{$path}].");

                return self::FAILURE;
            }
        }

        if (! $this->removeLegacyLink($public)) {
            return self::FAILURE;
        }

        $this->info('Report evidence is private and the legacy web link is removed.');

        return self::SUCCESS;
    }

    private function isSafeReportPath(mixed $path): bool
    {
        return is_string($path)
            && ! str_contains($path, '..')
            && (
                str_starts_with($path, 'reports/')
                || str_starts_with($path, 'seeded/')
            );
    }

    private function filesMatch(
        FilesystemAdapter $private,
        FilesystemAdapter $public,
        string $path,
    ): bool {
        return hash('sha256', $private->get($path))
            === hash('sha256', $public->get($path));
    }

    private function legacyLinkIsSafe(FilesystemAdapter $public): bool
    {
        $link = config(
            'caneguard.legacy_public_storage_link',
            public_path('storage'),
        );

        if (! is_string($link) || ! is_link($link)) {
            return true;
        }

        $target = realpath($link);
        $expected = realpath($public->path(''));

        if ($target === false || $expected === false || $target !== $expected) {
            $this->error('The legacy storage link target was not recognized.');

            return false;
        }

        return true;
    }

    private function removeLegacyLink(FilesystemAdapter $public): bool
    {
        if (! $this->legacyLinkIsSafe($public)) {
            return false;
        }

        $link = config(
            'caneguard.legacy_public_storage_link',
            public_path('storage'),
        );

        if (! is_string($link) || ! is_link($link)) {
            return true;
        }

        if (! unlink($link)) {
            $this->error('The legacy public storage link could not be removed.');

            return false;
        }

        return true;
    }
}
