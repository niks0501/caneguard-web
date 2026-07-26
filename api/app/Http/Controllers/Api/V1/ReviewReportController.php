<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReviewReportRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use Illuminate\Support\Facades\DB;

class ReviewReportController extends Controller
{
    public function __invoke(
        ReviewReportRequest $request,
        Report $report,
    ): ReportResource {
        $data = $request->validated();

        $updated = DB::transaction(function () use ($request, $report, $data) {
            $locked = Report::query()
                ->lockForUpdate()
                ->findOrFail($report->getKey());

            abort_unless(
                $locked->lock_version === $data['expected_version'],
                409,
            );

            $locked->update([
                'review_status' => $data['status'],
                'review_notes' => $data['notes'] ?? null,
                'reviewer_id' => $request->user()->getKey(),
                'reviewed_at' => now(),
                'lock_version' => $locked->lock_version + 1,
            ]);

            return $locked;
        });

        return new ReportResource($updated->load([
            'reporter',
            'reviewer',
            'classScores',
            'symptoms',
            'qualityWarnings',
        ]));
    }
}
