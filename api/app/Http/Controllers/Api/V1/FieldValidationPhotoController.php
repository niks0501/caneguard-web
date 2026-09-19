<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Report;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FieldValidationPhotoController extends Controller
{
    public function __invoke(Report $report): StreamedResponse
    {
        $this->authorize('view', $report);

        $completion = $report->fieldValidationAssignment?->completion;
        abort_unless(
            $completion?->fresh_photo_path !== null
                && Storage::disk('local')->exists($completion->fresh_photo_path),
            404,
        );

        return Storage::disk('local')->response(
            $completion->fresh_photo_path,
            null,
            [
                'Content-Type' => $completion->fresh_photo_mime_type,
                'Cache-Control' => 'private, max-age=300',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }
}
