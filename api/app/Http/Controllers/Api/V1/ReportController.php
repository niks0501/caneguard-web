<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\QueryReports;
use App\Http\Controllers\Controller;
use App\Http\Requests\ListReportsRequest;
use App\Http\Resources\ReportListResource;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ReportController extends Controller
{
    public function index(
        ListReportsRequest $request,
        QueryReports $queryReports,
    ): AnonymousResourceCollection {
        return ReportListResource::collection(
            $queryReports->handle($request->validated()),
        );
    }

    public function show(Report $report): ReportResource
    {
        $this->authorize('view', $report);

        return new ReportResource($report->load([
            'reporter',
            'reviewer',
            'classScores',
            'symptoms',
            'qualityWarnings',
        ]));
    }
}
