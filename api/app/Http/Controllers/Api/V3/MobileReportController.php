<?php

namespace App\Http\Controllers\Api\V3;

use App\Actions\Reports\StoreReport;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMobileReportV3Request;
use App\Http\Resources\MobileReportUploadV3Resource;
use Illuminate\Http\JsonResponse;

class MobileReportController extends Controller
{
    public function store(
        StoreMobileReportV3Request $request,
        StoreReport $storeReport,
    ): JsonResponse {
        $result = $storeReport->handle(
            $request->user(),
            $request->validated(),
            $request->file('image'),
        );

        return (new MobileReportUploadV3Resource($result['report']))
            ->response()
            ->setStatusCode($result['created'] ? 201 : 200);
    }
}
