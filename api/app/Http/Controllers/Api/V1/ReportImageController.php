<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Report;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportImageController extends Controller
{
    public function __invoke(Report $report): StreamedResponse
    {
        $this->authorize('view', $report);

        abort_unless(
            Storage::disk('local')->exists($report->image_path),
            404,
        );

        return Storage::disk('local')->response(
            $report->image_path,
            null,
            [
                'Content-Type' => $report->image_mime_type,
                'Cache-Control' => 'private, max-age=300',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }
}
