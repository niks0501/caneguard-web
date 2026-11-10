<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\FieldValidationAssignment;
use App\Models\User;
use App\Security\DistrictAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MobileReportPhotoController extends Controller
{
    public function __invoke(
        Request $request,
        FieldValidationAssignment $assignment,
    ): StreamedResponse {
        $report = $assignment->report;
        abort_unless(
            $request->user()?->role === User::ROLE_FIELD_REPORTER
                && (string) $assignment->assignee_id === (string) $request->user()->getKey()
                && app(DistrictAccess::class)->report($request->user(), $report, true),
            403,
        );

        $path = $report->image_path;
        abort_unless(
            $path !== null && $path !== '' && Storage::disk('local')->exists($path),
            404,
        );

        // The original report photo never changes after submission, so the
        // phone may keep it for a year without revalidating.
        return Storage::disk('local')->response(
            $path,
            null,
            [
                'Content-Type' => $report->image_mime_type,
                'Cache-Control' => 'private, max-age=31536000, immutable',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }
}
