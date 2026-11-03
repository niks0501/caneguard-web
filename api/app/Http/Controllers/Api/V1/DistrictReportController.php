<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildWeeklyReportContent;
use App\Actions\Reports\DistrictReportWorkflow;
use App\Actions\Reports\RenderWeeklyReport;
use App\Actions\Reports\WeeklyReportGraphics;
use App\Http\Controllers\Controller;
use App\Models\DistrictRecipientSet;
use App\Models\DistrictReportVersion;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class DistrictReportController extends Controller
{
    public function index(Request $request, DistrictAccess $access, BuildWeeklyReportContent $builder, DistrictReportWorkflow $workflow): JsonResponse
    {
        $input = $request->validate(['week' => ['sometimes', 'regex:/^\d{4}-W\d{2}$/']]);
        $start = isset($input['week']) ? $builder->period($input['week'])['start']->toDateString() : null;
        $gateOpen = config('caneguard.weekly_send_enabled') === true;
        $recipientSet = DistrictRecipientSet::query()->where('district_id', $access->pilotId())->whereNull('revoked_at')->orderByDesc('id')->first();
        $recipientsConfigured = $recipientSet !== null;
        $versions = DistrictReportVersion::query()->with('transmissions')->where('district_id', $access->pilotId())
            ->when($start, fn ($query) => $query->where('week_start', $start))
            ->orderByDesc('week_start')->orderByDesc('version')->limit(50)->get();

        $topVersion = $versions->groupBy('week_start')->map(fn ($group) => $group->max('version'));

        return response()->json(['data' => $versions->map(function ($version) use ($workflow, $topVersion): array {
            // No farmer names, raw sealed content, evidence hashes or PDF bytes in list responses.
            $content = $version->content ?? [];
            $weekStart = substr((string) $version->week_start, 0, 10);
            // Only the newest listed version of a week can still be current; older ones are superseded.
            $stale = $version->version < $topVersion[$version->week_start] ? 'newer_version' : $workflow->staleReason($version);

            return $version->only(['uuid', 'version', 'content_hash', 'approved_at', 'approved_name', 'approved_title', 'prepared_name', 'created_at', 'supersedes_version_id', 'version_reason', 'document_sha256', 'renderer_version'])
                + ['week' => CarbonImmutable::parse($weekStart, 'Asia/Manila')->format('o-\WW'), 'week_start' => $weekStart,
                    'is_current' => $stale === null, 'stale_reason' => $stale,
                    'headline' => ['cases' => (int) ($content['case_universe']['cases'] ?? 0),
                        'confirmed' => (int) collect($content['diseases'] ?? [])->sum('confirmed'),
                        'late_evidence' => (int) ($content['late_evidence']['received_later_for_this_week'] ?? 0)],
                    'appendix_enabled' => $content['appendix_enabled'] ?? false, 'transmissions' => $version->transmissions];
        }), 'meta' => [
            'send_enabled' => $gateOpen && $recipientsConfigured,
            'delivery_gate_open' => $gateOpen,
            'recipients_configured' => $recipientsConfigured,
            'recipient_count' => $recipientSet === null ? 0 : count($recipientSet->recipients),
            'appendix_allowed' => $workflow->appendixAllowed($request->user()),
        ]])->header('Cache-Control', 'private, no-store');
    }

    public function document(Request $request, DistrictReportVersion $version, DistrictAccess $access, DistrictReportWorkflow $workflow, RenderWeeklyReport $renderer): Response
    {
        Gate::authorize('view', $version);
        abort_unless(in_array($version->content['contract'] ?? null, BuildWeeklyReportContent::CONTRACTS, true), 409);
        $input = $request->validate(['disease' => ['sometimes', Rule::in(array_keys(BuildWeeklyReportContent::DISEASES))], 'appendix' => ['sometimes', 'boolean']]);
        $appendix = $request->boolean('appendix');
        abort_if($appendix && ! $workflow->appendixAllowed($request->user()), 403);

        return response()->view('reports.weekly-document', $renderer->data($version, $input['disease'] ?? null, $appendix))->header('Cache-Control', 'private, no-store');
    }

    public function pdf(Request $request, DistrictReportVersion $version, DistrictAccess $access, DistrictReportWorkflow $workflow, RenderWeeklyReport $renderer, WeeklyReportGraphics $graphics): Response
    {
        Gate::authorize('view', $version);
        // Filtered HTML is a derived convenience, never an alternative approved PDF.
        $request->validate(['disease' => ['prohibited'], 'appendix' => ['prohibited']]);
        abort_if(($version->content['appendix_enabled'] ?? false) && ! $workflow->appendixAllowed($request->user()), 403);
        abort_unless(in_array($version->content['contract'] ?? null, BuildWeeklyReportContent::CONTRACTS, true), 409);
        $bytes = $version->approved_at ? $renderer->approvedBytes($version) : $renderer->pdf($version);

        return response($bytes)->header('Content-Type', 'application/pdf')
            ->header('Content-Disposition', 'attachment; filename="'.$renderer->filename($version).'"')
            ->header('Cache-Control', 'private, no-store')
            ->header('X-Document-SHA256', hash('sha256', $bytes))
            ->header('X-Report-Renderer-Drift', hash_equals($version->content['map']['asset_digest'], $graphics->assetDigest()) && ($version->renderer_version === null || $version->renderer_version === RenderWeeklyReport::VERSION) ? 'no' : 'yes');
    }

    public function prepare(Request $request, DistrictReportWorkflow $workflow): JsonResponse
    {
        $input = $request->validate(['week' => ['required', 'regex:/^\d{4}-W\d{2}$/'], 'appendix' => ['sometimes', 'boolean']]);
        $version = $workflow->prepare($request->user(), $input['week'], $request->boolean('appendix'));

        return response()->json(['data' => $version->makeHidden(['content', 'source_refs'])], 201)->header('Cache-Control', 'private, no-store');
    }

    public function approve(Request $request, DistrictReportVersion $version, DistrictReportWorkflow $workflow, DistrictAccess $access): JsonResponse
    {
        $input = $request->validate(['content_hash' => ['required', 'regex:/^[a-f0-9]{64}$/']]);

        return response()->json(['data' => $workflow->approve($request->user(), $version, $input['content_hash'])->makeHidden(['content', 'source_refs'])])->header('Cache-Control', 'private, no-store');
    }

    public function send(Request $request, DistrictReportVersion $version, DistrictReportWorkflow $workflow, DistrictAccess $access): JsonResponse
    {
        $input = $request->validate(['content_hash' => ['required', 'regex:/^[a-f0-9]{64}$/'], 'idempotency_key' => ['required', 'uuid']]);

        return response()->json(['data' => $workflow->requestSend($request->user(), $version, $input['content_hash'], $input['idempotency_key'])], 202)->header('Cache-Control', 'private, no-store');
    }
}
