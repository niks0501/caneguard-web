<?php

namespace App\Console\Commands;

use App\Actions\Auth\RecordSecurityAudit;
use App\Models\ReportAerialAnalysis;
use App\Models\SecurityAudit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

final class PruneRemovedAerialAnalyses extends Command
{
    protected $signature = 'caneguard:prune-removed-aerial-analyses {--days= : Override retention days for soft-removed aerial checks}';

    protected $description = 'Delete soft-removed aerial checks and their private files past the retention window';

    public function handle(RecordSecurityAudit $audit): int
    {
        $rawDays = $this->option('days');
        $days = $rawDays !== null && $rawDays !== ''
            ? max(1, (int) $rawDays)
            : max(1, (int) config('caneguard.aerial.removed_retention_days', 30));
        $cutoff = now()->subDays($days);
        $disk = Storage::disk('local');
        $pruned = 0;
        $failed = 0;

        ReportAerialAnalysis::query()
            ->whereNotNull('removed_at')
            ->where('removed_at', '<=', $cutoff)
            ->orderBy('id')
            ->chunkById(100, function ($rows) use ($disk, &$pruned, &$failed): void {
                foreach ($rows as $row) {
                    $cleaned = true;
                    foreach (array_filter([$row->image_path, $row->mask_path]) as $path) {
                        if ($disk->exists($path) && ! $disk->delete($path)) {
                            $cleaned = false;
                            Log::warning('Failed to delete expired removed aerial file.', [
                                'analysis_uuid' => $row->uuid,
                                'path' => $path,
                            ]);
                        }
                    }

                    if (! $cleaned) {
                        $failed += 1;

                        continue;
                    }

                    $row->delete();
                    $pruned += 1;
                }
            });

        $audit->handle(SecurityAudit::ACTION_PRUNE_RUN, SecurityAudit::OUTCOME_SUCCESS, metadata: [
            'command' => 'caneguard:prune-removed-aerial-analyses',
            'days' => $days,
            'pruned' => $pruned,
            'failed' => $failed,
        ]);

        $this->info("Pruned {$pruned} removed aerial check(s) older than {$days} day(s).");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
