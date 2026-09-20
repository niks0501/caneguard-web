<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\FieldValidationAssignment;
use App\Models\User;
use App\Support\MobilePreviousVisit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MobilePreviousEvidencePhotoController extends Controller
{
    public function __invoke(
        Request $request,
        FieldValidationAssignment $assignment,
    ): StreamedResponse {
        abort_unless(
            $request->user()?->role === User::ROLE_FIELD_REPORTER
                && (string) $assignment->assignee_id === (string) $request->user()->getKey(),
            403,
        );

        $previous = MobilePreviousVisit::resolve($assignment);
        $path = $previous?->completion?->fresh_photo_path;
        abort_unless(
            $path !== null && Storage::disk('local')->exists($path),
            404,
        );

        return Storage::disk('local')->response(
            $path,
            null,
            [
                'Content-Type' => $previous->completion->fresh_photo_mime_type,
                'Cache-Control' => 'private, max-age=300',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }
}
