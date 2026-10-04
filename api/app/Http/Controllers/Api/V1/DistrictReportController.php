<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildReportDocument;
use App\Actions\Reports\DistrictReportWorkflow;
use App\Http\Controllers\Controller;
use App\Models\DistrictRecipientSet;
use App\Models\DistrictReportVersion;
use App\Security\DistrictAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class DistrictReportController extends Controller
{
    public function index(Request $request, DistrictAccess $access): JsonResponse
    {
        $input = $request->validate(['week' => ['sometimes', 'regex:/^\d{4}-W\d{2}$/']]);
        $start = isset($input['week']) ? app(BuildReportDocument::class)
            ->resolvePeriod(['period_type' => 'weekly', 'week' => $input['week']])['start']->toDateString() : null;
        $versions = DistrictReportVersion::query()->where('district_id', $access->pilotId())
            ->when($start, fn ($query) => $query->where('week_start', $start))
            ->orderByDesc('week_start')->orderByDesc('version')->limit(50)->get();

        return response()->json(['data' => $versions, 'meta' => [
            'send_enabled' => config('caneguard.weekly_send_enabled') === true
                && DistrictRecipientSet::query()->where('district_id', $access->pilotId())->whereNull('revoked_at')->exists(),
        ]])->header('Cache-Control', 'private, no-store');
    }

    public function document(Request $request, DistrictReportVersion $version, DistrictAccess $access): Response
    {
        abort_unless($access->allows($request->user(), $version->district_id), 403);

        return response()->view('reports.document', $version->content)->header('Cache-Control', 'private, no-store');
    }

    public function prepare(Request $request, DistrictReportWorkflow $workflow): JsonResponse
    {
        $input = $request->validate(['week' => ['required', 'regex:/^\\d{4}-W\\d{2}$/']]);

        return response()->json(['data' => $workflow->prepare($request->user(), $input['week'])], 201);
    }

    public function approve(Request $request, DistrictReportVersion $version, DistrictReportWorkflow $workflow, DistrictAccess $access): JsonResponse
    {
        abort_unless($access->grant($request->user(), 'report:approve', $version->district_id) !== null, 403);
        $input = $request->validate(['content_hash' => ['required', 'regex:/^[a-f0-9]{64}$/']]);

        return response()->json(['data' => $workflow->approve($request->user(), $version, $input['content_hash'])]);
    }

    public function send(Request $request, DistrictReportVersion $version, DistrictReportWorkflow $workflow, DistrictAccess $access): JsonResponse
    {
        abort_unless($access->grant($request->user(), 'report:send', $version->district_id) !== null, 403);
        $input = $request->validate([
            'content_hash' => ['required', 'regex:/^[a-f0-9]{64}$/'],
            'idempotency_key' => ['required', 'uuid'],
        ]);

        return response()->json(['data' => $workflow->requestSend($request->user(), $version, $input['content_hash'], $input['idempotency_key'])], 202);
    }
}
