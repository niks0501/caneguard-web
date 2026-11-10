<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReportStatusesRequest;
use App\Http\Resources\ReportStatusResource;
use App\Http\Resources\ReportStatusV3Resource;
use App\Models\Report;
use App\Support\MobileFeedVersion;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MobileReportStatusController extends Controller
{
    public function __invoke(
        ReportStatusesRequest $request,
    ): AnonymousResourceCollection|JsonResponse {
        $syncBefore = CarbonImmutable::parse(
            $request->validated('sync_before') ?? now(),
        )->utc();
        $isV3 = $request->routeIs('api.v3.mobile.reports.statuses');
        $owned = Report::query()->visibleTo(request()->user())
            ->when($isV3, fn ($query) => $query->with('advisory'))
            ->whereBelongsTo($request->user(), 'reporter')
            ->where('updated_at', '<', $syncBefore->startOfSecond()->addSecond());

        // The version covers the reporter's whole status set as serialized for
        // this API version, so any visible change moves it.
        $stamp = MobileFeedVersion::digest(
            (clone $owned)->orderBy('id')->lazy(500)->map(
                fn (Report $report): array => ($isV3
                    ? new ReportStatusV3Resource($report)
                    : new ReportStatusResource($report))->resolve($request),
            ),
        );
        $cursor = $request->validated('cursor');
        if ($cursor !== null && $request->validated('sync_version') !== $stamp['version']) {
            return response()->json([
                'message' => 'The status set changed during the download. Start the feed again.',
                'code' => 'SYNC_RESTART',
                'sync' => [
                    'before' => $syncBefore->toISOString(),
                    'version' => $stamp['version'],
                    'total' => $stamp['total'],
                    'truncated' => false,
                    'unchanged' => false,
                ],
            ], 409);
        }

        $since = filled($request->validated('since'))
            ? $request->validated('since')
            : null;
        $unchanged = $cursor === null && $since === $stamp['version'];

        $reports = $owned
            ->when($unchanged, fn ($query) => $query->whereRaw('1 = 0'))
            ->orderBy('updated_at')
            ->orderBy('id')
            ->cursorPaginate((int) ($request->validated('per_page') ?? 100))
            ->withQueryString()
            ->appends([
                'sync_before' => $syncBefore->toISOString(),
                'sync_version' => $stamp['version'],
            ]);

        $resource = $isV3
            ? ReportStatusV3Resource::collection($reports)
            : ReportStatusResource::collection($reports);

        return $resource->additional([
            'sync' => [
                'before' => $syncBefore->toISOString(),
                'version' => $stamp['version'],
                'total' => $stamp['total'],
                'truncated' => false,
                'unchanged' => $unchanged,
            ],
        ]);
    }
}
