<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReportStatusesRequest;
use App\Http\Resources\ReportStatusResource;
use App\Http\Resources\ReportStatusV3Resource;
use App\Models\Report;
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
        $isV3 = $request->routeIs('api.v3.mobile.reports.statuses');
        $reports = Report::query()->visibleTo(request()->user())
            ->when($isV3, fn ($query) => $query->with('advisory'))
            ->whereBelongsTo($request->user(), 'reporter')
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
            ->where('updated_at', '<=', $syncBefore)
            ->cursorPaginate((int) ($request->validated('per_page') ?? 100))
            ->withQueryString()
            ->appends(['sync_before' => $syncBefore->toISOString()]);

        $resource = $isV3
            ? ReportStatusV3Resource::collection($reports)
            : ReportStatusResource::collection($reports);

        return $resource->additional([
            'sync' => [
                'before' => $syncBefore->toISOString(),
            ],
        ]);
    }
}
