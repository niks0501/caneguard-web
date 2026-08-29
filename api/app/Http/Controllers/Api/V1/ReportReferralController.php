<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\RecordReportReferral;
use App\Http\Controllers\Controller;
use App\Http\Requests\RecordReferralRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use Illuminate\Http\JsonResponse;

class ReportReferralController extends Controller
{
    public function store(
        RecordReferralRequest $request,
        Report $report,
        RecordReportReferral $recordReferral,
    ): JsonResponse {
        $updated = $recordReferral->handle(
            $request->user(),
            $report,
            $request->validated(),
        );

        return (new ReportResource($updated->load([
            'reporter',
            'reviewer',
            'fieldValidationAssignment.assignee',
            'fieldValidationAssignment.assignedBy',
            'classScores',
            'symptoms',
            'qualityWarnings',
            'referral.referredBy',
            'referral.responseRecordedBy',
            'referral.officeReviewer',
            'audits.actor',
        ])))
            ->response()
            ->setStatusCode(201);
    }
}
