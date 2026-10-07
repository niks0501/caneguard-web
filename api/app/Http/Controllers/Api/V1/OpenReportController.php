<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Idempotent case-open stamp (Q8).
 *
 * Opening a case is what moves an untouched case from Needs Review to Under
 * Review. The stamp is written only when it is empty, is safe to retry, and
 * never bumps `lock_version` so a review decision the reviewer already loaded
 * stays valid.
 */
class OpenReportController extends Controller
{
    public function __invoke(Report $report): JsonResponse
    {
        $this->authorize('view', $report);

        $stamped = DB::transaction(function () use ($report): Report {
            $locked = Report::query()
                ->lockForUpdate()
                ->findOrFail($report->getKey());

            if ($locked->first_reviewed_at === null) {
                $locked->first_reviewed_at = now()->utc();
                $locked->save();
            }

            return $locked;
        });

        return response()->json([
            'data' => [
                'uuid' => $stamped->uuid,
                'first_reviewed_at' => $stamped->first_reviewed_at?->utc()->toISOString(),
            ],
        ]);
    }
}
