<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\ManageReviewClaim;
use App\Http\Controllers\Controller;
use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Claim, heartbeat, take over, and release a case's review lease.
 *
 * Claiming and heartbeats are the same call: a holder's repeat claim renews the
 * lease. A refused claim answers 423 with the current holder so the client can
 * show who is reviewing and since when.
 */
class ReportReviewClaimController extends Controller
{
    public function store(Request $request, Report $report, ManageReviewClaim $claims): JsonResponse
    {
        $this->authorize('review', $report);

        $result = $claims->claim(
            $report,
            $request->user(),
            takeover: $request->boolean('takeover'),
        );
        $payload = $result['report']->reviewClaimPayload($request->user());

        return response()->json(
            ['data' => $payload, 'message' => $result['held'] ? null : 'This case is being reviewed by another reviewer.'],
            $result['held'] ? 200 : 423,
        );
    }

    public function destroy(Request $request, Report $report, ManageReviewClaim $claims): JsonResponse
    {
        $this->authorize('review', $report);
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);
        $claims->release($report, $request->user(), $data['note'] ?? null);

        return response()->json(['data' => null]);
    }
}
