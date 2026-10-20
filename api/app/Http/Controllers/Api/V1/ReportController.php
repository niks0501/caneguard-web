<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildReportCaseHistory;
use App\Actions\Reports\QueryReports;
use App\Http\Controllers\Controller;
use App\Http\Requests\ListReportsRequest;
use App\Http\Resources\ReportListResource;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ReportController extends Controller
{
    public function index(
        ListReportsRequest $request,
        QueryReports $queryReports,
    ): AnonymousResourceCollection {
        return ReportListResource::collection(
            $queryReports->handle($request->validated()),
        );
    }

    public function show(Report $report, BuildReportCaseHistory $caseHistory): ReportResource
    {
        $this->authorize('view', $report);

        $relations = [
            'reporter',
            'reviewer',
            'advisory',
            'canonicalReport',
            'fieldValidationAssignment.assignee',
            'fieldValidationAssignment.assignedBy',
            'fieldValidationAssignment.completion',
            'affectedFieldSurveys.inspector',
            'referral.referredBy',
            'referral.expert',
            'referral.responseRecordedBy',
            'referral.findingRecordedBy',
            'referral.officeReviewer',
            'referral.consultReviewedBy',
            'referrals.expert',
            'referrals.consultReviewedBy',
            'referral.symptomFindings',
            'referrals.symptomFindings',
            'handoffNotes',
            'classScores',
            'symptoms',
            'qualityWarnings',
            'audits.actor',
            ...$caseHistory->relations(),
        ];

        return new ReportResource($report->load(array_values(array_unique($relations))));
    }
}
