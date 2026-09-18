<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\QueryExpertQueue;
use App\Http\Controllers\Controller;
use App\Http\Requests\ExpertQueueRequest;
use App\Http\Resources\ReportListResource;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ExpertQueueController extends Controller
{
    public function __invoke(
        ExpertQueueRequest $request,
        QueryExpertQueue $queryExpertQueue,
    ): AnonymousResourceCollection {
        return ReportListResource::collection(
            $queryExpertQueue->handle($request->user(), $request->validated()),
        );
    }
}
