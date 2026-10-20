<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Surveys\QueryFieldSurveys;
use App\Http\Controllers\Controller;
use App\Http\Requests\ListFieldSurveysRequest;
use App\Http\Resources\FieldSurveyFeatureResource;
use Illuminate\Http\JsonResponse;

class FieldSurveyMapController extends Controller
{
    public function __invoke(
        ListFieldSurveysRequest $request,
        QueryFieldSurveys $queryFieldSurveys,
    ): JsonResponse {
        $result = $queryFieldSurveys->handle($request->validated());

        return response()->json([
            'type' => 'FeatureCollection',
            'features' => FieldSurveyFeatureResource::collection($result['surveys'])
                ->resolve($request),
            'metadata' => [
                'total_count' => $result['total_count'],
                'returned_count' => $result['returned_count'],
                'limit' => $result['limit'],
                'truncated' => $result['truncated'],
            ],
        ])->header('Cache-Control', 'private, no-store');
    }
}
