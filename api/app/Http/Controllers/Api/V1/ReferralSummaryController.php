<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ReferralSummaryResource;
use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ReferralSummaryController extends Controller
{
    public function __invoke(Request $request, Report $report): JsonResponse|Response
    {
        $this->authorize('view', $report);

        $report->load([
            'reporter',
            'referral.officeReviewer',
            'referral.expert',
            'referral.findingRecordedBy',
            'symptoms',
        ]);
        abort_unless($report->referral !== null, 404);

        $summary = (new ReferralSummaryResource($report))->resolve($request);
        if ($request->expectsJson()) {
            return response()->json(['data' => $summary]);
        }

        $filename = preg_replace(
            '/[^A-Za-z0-9._-]+/',
            '-',
            $report->reference_code.'-referral-summary.html',
        ) ?: 'referral-summary.html';
        $disposition = $request->boolean('download') ? 'attachment' : 'inline';

        return response()
            ->view('referrals.summary', ['summary' => $summary])
            ->header('Content-Type', 'text/html; charset=UTF-8')
            ->header('Content-Disposition', $disposition.'; filename="'.$filename.'"');
    }
}
