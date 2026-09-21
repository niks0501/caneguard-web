<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildReportCaseHistory;
use App\Actions\Reports\ConfirmExpertReferral;
use App\Http\Controllers\Controller;
use App\Http\Requests\ConfirmExpertReferralRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;

class ConfirmExpertReferralController extends Controller
{
    public function __invoke(
        ConfirmExpertReferralRequest $request,
        Report $report,
        ConfirmExpertReferral $confirmExpertReferral,
    ): ReportResource {
        $updated = $confirmExpertReferral->handle(
            $request->user(),
            $report,
            $request->validated(),
        );

        return new ReportResource($updated->load([
            'reporter',
            'reviewer',
            'advisory',
            'fieldValidationAssignment.assignee',
            'fieldValidationAssignment.assignedBy',
            'classScores',
            'symptoms',
            'qualityWarnings',
            'referral.referredBy',
            'referral.expert',
            'referral.responseRecordedBy',
            'referral.findingRecordedBy',
            'referral.officeReviewer',
            'referral.consultReviewedBy',
            'referrals.expert',
            'referrals.consultReviewedBy',
            'audits.actor',
            ...app(BuildReportCaseHistory::class)->relations(),
        ]));
    }
}
