<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReportStatusesRequest;
use App\Http\Resources\ReportStatusResource;
use App\Http\Resources\ReportStatusV3Resource;
use App\Models\Report;
use App\Support\MobileFeedVersion;
use Carbon\CarbonImmutable;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MobileReportStatusController extends Controller
{
    public function __invoke(
        ReportStatusesRequest $request,
    ): AnonymousResourceCollection {
        $syncBefore = CarbonImmutable::parse(
            $request->validated('sync_before') ?? now(),
        )->utc();
        if ($request->validated('sync_before') === null) {
            // Database timestamps may truncate the instant used for the
            // checkpoint; the ceiling keeps a just-updated report in this feed.
            $syncBefore = $syncBefore->addSecond();
        }
        $isV3 = $request->routeIs('api.v3.mobile.reports.statuses');
        $owned = Report::query()->visibleTo(request()->user())
            ->when($isV3, fn ($query) => $query->with('advisory'))
            ->whereBelongsTo($request->user(), 'reporter')
            ->where('updated_at', '<=', $syncBefore);

        // The version covers the reporter's whole status set as serialized for
        // this API version, not just the `updated_after` slice.
        $stamp = MobileFeedVersion::digest(
            (clone $owned)->orderBy('id')->lazy(500)->map(
                fn (Report $report): array => ($isV3
                    ? new ReportStatusV3Resource($report)
                    : new ReportStatusResource($report))->resolve($request),
            ),
        );
        $unchanged = $request->validated('cursor') === null
            && $request->validated('since') === $stamp['version'];

        $reports = $owned
            ->when($unchanged, fn ($query) => $query->whereRaw('1 = 0'))
            ->when(
                $request->validated('updated_after'),
                fn ($query, string $updatedAfter) => $query
                    ->where(
                        'updated_at',
                        '>',
                        CarbonImmutable::parse($updatedAfter)->utc(),
                    ),
            )
            ->orderBy('updated_at')
            ->orderBy('id')
            ->cursorPaginate((int) ($request->validated('per_page') ?? 100))
            ->withQueryString()
            ->appends(['sync_before' => $syncBefore->toISOString()]);

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
