<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\RecordExpertReferralResponse;
use App\Http\Controllers\Controller;
use App\Http\Requests\RecordExpertReferralResponseRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;

class ExpertReferralResponseController extends Controller
{
    public function __invoke(
        RecordExpertReferralResponseRequest $request,
        Report $report,
        RecordExpertReferralResponse $recordResponse,
    ): ReportResource {
        $updated = $recordResponse->handle(
            $request->user(),
            $report,
            $request->validated(),
        );

        return new ReportResource($updated->load([
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
        ]));
    }
}
