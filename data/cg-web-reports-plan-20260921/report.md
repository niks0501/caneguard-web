# Report documents — implementation status

The approved report-document plan is implemented. This note records the current design and points to the code that owns it.

## Current flow

- `GET /api/v1/reports/documents/report` returns the authenticated HTML preview.
- `GET /api/v1/reports/documents/report/pdf` returns the PDF download.
- Both routes use the same `reports.document` Blade view and the existing report-document builder, so the preview and download share their report data and wording.
- The PDF renderer is `spatie/laravel-pdf` with Dompdf, configured in `api/config/laravel-pdf.php` and declared in `api/composer.json` / `api/composer.lock`.
- The API host needs PHP dependencies only; PDF generation does not rely on an external rendering binary or a renderer-specific path setting.

## Rendering constraints

The report template uses table-based layout and ordinary CSS properties supported by Dompdf. Its report labels, metrics, supplementary information, optional appendix, and reporting boundaries remain in `api/resources/views/reports/document.blade.php`. The preview route remains HTML and keeps its existing API response contract.

## Verification

`api/tests/Feature/ReportDocumentTest.php` covers the HTML preview, document content, fake-renderer route contract, and a real Dompdf PDF response including its PDF structure and rendered text. The UI error message for renderer failures lives in `src/components/reports/ReportDocumentBuilder.tsx`.
