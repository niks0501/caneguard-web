<?php

namespace App\Http\Controllers\Api\V2;

use App\Actions\Reports\StoreReport;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMobileReportV2Request;
use App\Http\Resources\MobileReportUploadResource;
use Illuminate\Http\JsonResponse;

class MobileReportController extends Controller
{
    public function store(
        StoreMobileReportV2Request $request,
        StoreReport $storeReport,
    ): JsonResponse {
        $result = $storeReport->handle(
            $request->user(),
            $request->validated(),
            $request->file('image'),
        );

        return (new MobileReportUploadResource($result['report']))
            ->response()
            ->setStatusCode($result['created'] ? 201 : 200);
    }
}
