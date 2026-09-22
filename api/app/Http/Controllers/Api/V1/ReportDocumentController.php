<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildReportDocument;
use App\Http\Controllers\Controller;
use App\Http\Requests\ReportDocumentRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Spatie\LaravelPdf\Facades\Pdf;
use Spatie\LaravelPdf\PdfBuilder;

final class ReportDocumentController extends Controller
{
    public function __invoke(
        ReportDocumentRequest $request,
        BuildReportDocument $buildReportDocument,
    ): Response|JsonResponse|PdfBuilder {
        $payload = $buildReportDocument->handle($request->validated());
        $isPdf = $request->routeIs('api.v1.reports.documents.pdf')
            || $request->input('format') === 'pdf';
        $filename = 'caneguard-report-'.$payload['period']['from'].'-'.$payload['period']['to'];

        if ($isPdf) {
            try {
                return Pdf::view('reports.document', $payload)
                    ->format('a4')
                    ->name($filename)
                    ->download();
            } catch (\Throwable $exception) {
                report($exception);

                return response()->json([
                    'message' => 'The PDF could not be generated. The document preview is still available.',
                    'code' => 'PDF_RENDER_FAILED',
                ], 503);
            }
        }

        $response = response()->view('reports.document', $payload);
        $response->header(
            'Content-Disposition',
            ($request->boolean('download') ? 'attachment' : 'inline').'; filename="'.$filename.'.html"',
        );
        $response->header('Cache-Control', 'no-store, private');

        return $response;
    }
}
