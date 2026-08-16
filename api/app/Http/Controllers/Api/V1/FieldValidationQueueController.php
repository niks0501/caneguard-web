<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\QueryFieldValidationQueue;
use App\Http\Controllers\Controller;
use App\Http\Requests\FieldValidationQueueRequest;
use App\Http\Resources\FieldValidationQueueResource;
use Illuminate\Http\JsonResponse;

class FieldValidationQueueController extends Controller
{
    public function __invoke(
        FieldValidationQueueRequest $request,
        QueryFieldValidationQueue $queryFieldValidationQueue,
    ): JsonResponse {
        $result = $queryFieldValidationQueue->handle($request->validated());
        $items = FieldValidationQueueResource::collection($result['items'])
            ->resolve($request);

        return response()->json([
            'data' => [
                'count' => $result['count'],
                'oldest' => $items[0] ?? null,
                'items' => $items,
            ],
        ])->header('Cache-Control', 'private, no-store');
    }
}
