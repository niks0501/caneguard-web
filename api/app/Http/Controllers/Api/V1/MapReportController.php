<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\QueryMapReports;
use App\Http\Controllers\Controller;
use App\Http\Requests\MapReportsRequest;
use App\Http\Resources\MapReportResource;
use Illuminate\Http\JsonResponse;

class MapReportController extends Controller
{
    public function __invoke(
        MapReportsRequest $request,
        QueryMapReports $queryMapReports,
    ): JsonResponse {
        $result = $queryMapReports->handle($request->validated());

        return response()->json([
            'type' => 'FeatureCollection',
            'features' => MapReportResource::collection($result['reports'])
                ->resolve($request),
            'metadata' => [
                'total_count' => $result['total_count'],
                'located_count' => $result['located_count'],
                'unlocated_count' => $result['unlocated_count'],
            ],
        ])->header('Cache-Control', 'private, no-store');
    }
}
