<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\LinkDuplicateReport;
use App\Http\Controllers\Controller;
use App\Http\Requests\LinkDuplicateReportRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;

class LinkDuplicateReportController extends Controller
{
    public function __invoke(
        LinkDuplicateReportRequest $request,
        Report $report,
        LinkDuplicateReport $linkDuplicateReport,
    ): ReportResource {
        $data = $request->validated();
        $linked = $linkDuplicateReport->handle(
            $request->user(),
            $report,
            $data['canonical_report_uuid'],
            $data['reason'] ?? null,
        );

        return new ReportResource($linked->load([
            'reporter',
            'reviewer',
            'canonicalReport',
            'fieldValidationAssignment.assignee',
            'fieldValidationAssignment.assignedBy',
            'fieldValidationAssignment.completion',
            'classScores',
            'symptoms',
            'qualityWarnings',
            'audits.actor',
        ]));
    }
}
