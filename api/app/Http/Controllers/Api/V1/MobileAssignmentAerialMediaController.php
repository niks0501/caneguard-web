<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildMobileAerialBrief;
use App\Http\Controllers\Controller;
use App\Models\FieldValidationAssignment;
use App\Models\ReportAerialAnalysis;
use App\Models\User;
use App\Security\DistrictAccess;
use App\Support\AerialSwitch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MobileAssignmentAerialMediaController extends Controller
{
    public function preview(
        Request $request,
        FieldValidationAssignment $assignment,
        BuildMobileAerialBrief $briefBuilder,
    ): StreamedResponse {
        return $this->serve($request, $assignment, $briefBuilder, 'preview_path');
    }

    public function overlay(
        Request $request,
        FieldValidationAssignment $assignment,
        BuildMobileAerialBrief $briefBuilder,
    ): StreamedResponse {
        return $this->serve($request, $assignment, $briefBuilder, 'overlay_path');
    }

    private function serve(
        Request $request,
        FieldValidationAssignment $assignment,
        BuildMobileAerialBrief $briefBuilder,
        string $pathKey,
    ): StreamedResponse {
        abort_unless(AerialSwitch::enabled(), 404);

        $report = $assignment->report;
        abort_unless(
            $request->user()?->role === User::ROLE_FIELD_REPORTER
                && (string) $assignment->assignee_id === (string) $request->user()->getKey()
                && app(DistrictAccess::class)->report($request->user(), $report, true),
            403,
        );

        /** @var ReportAerialAnalysis|null $analysis */
        $analysis = $report->aerialAnalyses()->first();
        abort_if($analysis === null, 404);

        $brief = $briefBuilder->ensure($analysis);
        abort_if($brief === null, 404);

        $path = $brief[$pathKey];
        abort_unless(Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response(
            $path,
            null,
            [
                'Content-Type' => 'image/jpeg',
                'Cache-Control' => 'private, no-cache',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }
}
