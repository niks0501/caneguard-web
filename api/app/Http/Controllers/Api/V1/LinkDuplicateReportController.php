<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildReportCaseHistory;
use App\Actions\Reports\LinkDuplicateReport;
use App\Actions\Reports\UnlinkDuplicateReport;
use App\Http\Controllers\Controller;
use App\Http\Requests\LinkDuplicateReportRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;

class LinkDuplicateReportController extends Controller
{
    public function store(
        LinkDuplicateReportRequest $request,
        Report $report,
        LinkDuplicateReport $linkDuplicateReport,
    ): ReportResource {
        $data = $request->validated();
        $linked = $linkDuplicateReport->handle(
            $request->user(),
            $report,
            $data['canonical_report_uuid'],
            (int) $data['expected_version'],
            $data['reason'] ?? null,
        );

        return $this->resource($linked);
    }

    public function destroy(
        LinkDuplicateReportRequest $request,
        Report $report,
        UnlinkDuplicateReport $unlinkDuplicateReport,
    ): ReportResource {
        $data = $request->validated();
        $unlinked = $unlinkDuplicateReport->handle(
            $request->user(),
            $report,
            (int) $data['expected_version'],
            $data['reason'] ?? null,
        );

        return $this->resource($unlinked);
    }

    private function resource(Report $report): ReportResource
    {
        return new ReportResource($report->load([
            'reporter',
            'reviewer',
            'advisory',
            'canonicalReport',
            'fieldValidationAssignment.assignee',
            'fieldValidationAssignment.assignedBy',
            'fieldValidationAssignment.completion',
            'classScores',
            'symptoms',
            'qualityWarnings',
            'audits.actor',
            ...app(BuildReportCaseHistory::class)->relations(),
        ]));
    }
}
