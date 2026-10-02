<?php

namespace App\Http\Controllers\Api\V1;

use App\Contracts\MobileReportUploadContract;
use App\Http\Controllers\Controller;
use App\Http\Resources\ReferralSummaryResource;
use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;

class ReferralSummaryController extends Controller
{
    public function __invoke(Request $request, Report $report): JsonResponse|Response
    {
        $this->authorize('view', $report);

        $report->load([
            'reporter',
            'advisory.validatedBy',
            'referral.officeReviewer',
            'referral.expert',
            'referral.findingRecordedBy',
            'referral.consultReviewedBy',
            'symptoms',
        ]);
        abort_unless($report->referral !== null, 404);

        $summary = (new ReferralSummaryResource($report))->resolve($request);
        if ($request->expectsJson()) {
            return response()->json(['data' => $summary]);
        }

        $download = $request->boolean('download');
        if ($download && $summary['primary_evidence']['available']) {
            $evidenceUrl = $this->embeddedEvidenceUrl($report);
            $summary['primary_evidence']['url'] = $evidenceUrl;
            $summary['primary_evidence']['available'] = $evidenceUrl !== null;
        }

        $filename = preg_replace(
            '/[^A-Za-z0-9._-]+/',
            '-',
            $report->reference_code.'-referral-summary.html',
        ) ?: 'referral-summary.html';
        $disposition = $download ? 'attachment' : 'inline';

        return response()
            ->view('referrals.summary', ['summary' => $summary])
            ->header('Content-Type', 'text/html; charset=UTF-8')
            ->header('Content-Disposition', $disposition.'; filename="'.$filename.'"');
    }

    private function embeddedEvidenceUrl(Report $report): ?string
    {
        $stream = Storage::disk('local')->readStream($report->image_path);
        if (! is_resource($stream)) {
            return null;
        }

        try {
            $maxBytes = MobileReportUploadContract::field('image')['max_bytes'];
            // Bound the actual disk read, including a byte to detect oversized files.
            $photo = stream_get_contents($stream, $maxBytes + 1);
            if ($photo === false || strlen($photo) > $maxBytes) {
                return null;
            }

            return 'data:'.$report->image_mime_type.';base64,'.base64_encode($photo);
        } finally {
            fclose($stream);
        }
    }
}
