<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildWeeklyRssiReport;
use App\Actions\Reports\ExportWeeklyRssiCsv;
use App\Http\Controllers\Controller;
use App\Http\Requests\WeeklyRssiExportRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Spatie\LaravelPdf\Facades\Pdf;

/**
 * Download-only. Office staff attach the file to their own email to the SRA;
 * nothing here sends mail on their behalf.
 */
final class WeeklyRssiExportController extends Controller
{
    public function __invoke(
        WeeklyRssiExportRequest $request,
        BuildWeeklyRssiReport $buildWeeklyRssiReport,
        ExportWeeklyRssiCsv $exportWeeklyRssiCsv,
    ): Response|JsonResponse {
        $report = $buildWeeklyRssiReport->handle($request->validated());
        $filename = 'caneguard-rssi-weekly-'.$report['period']['from'].'-to-'.$report['period']['to'];

        if (($request->validated()['format'] ?? 'csv') === 'pdf') {
            try {
                $pdf = Pdf::view('reports.rssi-weekly', ['report' => $report])
                    ->format('a4')
                    ->name($filename)
                    ->download();

                return $pdf->toResponse($request);
            } catch (\Throwable $exception) {
                report($exception);

                return response()->json([
                    'message' => 'The PDF could not be generated. The CSV export is still available.',
                    'code' => 'PDF_RENDER_FAILED',
                ], 503);
            }
        }

        return response($exportWeeklyRssiCsv->handle($report), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'.csv"',
            'Cache-Control' => 'no-store, private',
        ]);
    }
}
