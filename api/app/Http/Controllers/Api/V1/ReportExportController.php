<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\ExportReports;
use App\Http\Controllers\Controller;
use App\Http\Requests\ExportReportsRequest;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportExportController extends Controller
{
    public function __invoke(
        ExportReportsRequest $request,
        ExportReports $exportReports,
    ): StreamedResponse {
        return $exportReports->handle($request->validated());
    }
}
