<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildWeeklyReportContent;
use App\Actions\Reports\DistrictRssiReportWorkflow;
use App\Http\Controllers\Controller;
use App\Models\DistrictRssiReportVersion;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

final class DistrictRssiReportController extends Controller
{
    public function index(
        Request $request,
        DistrictAccess $access,
        BuildWeeklyReportContent $periods,
        DistrictRssiReportWorkflow $workflow,
    ): JsonResponse {
        $input = $request->validate(['week' => ['sometimes', 'regex:/^\d{4}-W\d{2}$/']]);
        $start = isset($input['week']) ? $periods->period($input['week'])['start']->toDateString() : null;

        $versions = DistrictRssiReportVersion::query()
            ->where('district_id', $access->pilotId())
            ->when($start, fn ($query) => $query->where('week_start', $start))
            ->orderByDesc('week_start')
            ->orderByDesc('version')
            ->limit(50)
            ->get();

        $topVersion = $versions->groupBy('week_start')->map(fn ($group) => $group->max('version'));

        return response()->json([
            'data' => $versions->map(function (DistrictRssiReportVersion $version) use ($workflow, $topVersion): array {
                $content = $version->content ?? [];
                $weekStart = substr((string) $version->week_start, 0, 10);
                $stale = $version->version < $topVersion[$version->week_start]
                    ? 'newer_version'
                    : $workflow->staleReason($version);

                return $version->only([
                    'uuid',
                    'version',
                    'content_hash',
                    'prepared_source',
                    'prepared_name',
                    'created_at',
                    'supersedes_version_id',
                    'version_reason',
                    'pdf_sha256',
                    'csv_sha256',
                    'renderer_version',
                ]) + [
                    'week' => CarbonImmutable::parse($weekStart, 'Asia/Manila')->format('o-\WW'),
                    'week_start' => $weekStart,
                    'is_current' => $stale === null,
                    'stale_reason' => $stale,
                    'headline' => [
                        'validated' => (int) ($content['sections']['validated']['cases'] ?? 0),
                        'suspected' => (int) ($content['sections']['suspected']['cases'] ?? 0),
                    ],
                ];
            })->values(),
        ])->header('Cache-Control', 'private, no-store');
    }

    public function prepare(Request $request, DistrictRssiReportWorkflow $workflow): JsonResponse
    {
        $input = $request->validate(['week' => ['required', 'regex:/^\d{4}-W\d{2}$/']]);
        $version = $workflow->prepare($request->user(), $input['week']);

        return response()->json([
            'data' => $version->makeHidden(['content', 'source_refs', 'pdf_bytes', 'csv_content']),
        ], 201)->header('Cache-Control', 'private, no-store');
    }

    public function document(Request $request, DistrictRssiReportVersion $version): Response
    {
        Gate::authorize('view', $version);

        return response()
            ->view('reports.rssi-weekly', ['report' => $version->content])
            ->header('Cache-Control', 'private, no-store');
    }

    public function pdf(
        Request $request,
        DistrictRssiReportVersion $version,
        DistrictRssiReportWorkflow $workflow,
    ): Response {
        Gate::authorize('view', $version);
        $bytes = $workflow->pdfBytes($version);

        return response($bytes)
            ->header('Content-Type', 'application/pdf')
            ->header('Content-Disposition', 'attachment; filename="'.$workflow->filename($version, 'pdf').'"')
            ->header('Cache-Control', 'private, no-store')
            ->header('X-Document-SHA256', hash('sha256', $bytes));
    }

    public function csv(
        Request $request,
        DistrictRssiReportVersion $version,
        DistrictRssiReportWorkflow $workflow,
    ): Response {
        Gate::authorize('view', $version);
        $csv = $workflow->csvContent($version);

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$workflow->filename($version, 'csv').'"',
            'Cache-Control' => 'private, no-store',
            'X-Document-SHA256' => hash('sha256', $csv),
        ]);
    }
}
