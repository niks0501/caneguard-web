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

        DB::transaction(function () use ($request, $report, $data) {
            $report->update([
                'review_status' => $data['status'],
                'review_notes' => $data['notes'] ?? null,
                'reviewer_id' => $request->user()->getKey(),
                'reviewed_at' => now(),
            ]);
        });

        return new ReportResource($report->load([
            'reporter',
            'reviewer',
            'classScores',
            'symptoms',
            'qualityWarnings',
        ]));
    }
}
