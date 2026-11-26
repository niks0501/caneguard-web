<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\AnalyzeAerialImage;
use App\Http\Controllers\Controller;
use App\Http\Resources\MobileFieldValidationAssignmentResource;
use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use App\Security\DistrictAccess;
use App\Support\AerialSwitch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\File;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Accepts a field inspector's queued drone gallery photo on an assigned case.
 * Never alters GPS coordinates, polygon area, severity, or completion state.
 */
class MobileAssignmentAerialAnalysisController extends Controller
{
    public function store(
        Request $request,
        FieldValidationAssignment $assignment,
        AnalyzeAerialImage $analyze,
    ): JsonResponse {
        $user = $request->user();
        $report = $assignment->report;

        abort_unless(
            $user?->role === User::ROLE_FIELD_REPORTER
                && (string) $assignment->assignee_id === (string) $user->getKey()
                && app(DistrictAccess::class)->report($user, $report, true),
            403,
        );

        if ($report->case_state !== Report::CASE_STATE_OPEN) {
            return response()->json([
                'message' => 'This case has already been closed by the office.',
                'code' => 'CASE_CLOSED',
            ], 409);
        }

        if (! AerialSwitch::enabled()) {
            return response()->json([
                'message' => 'Aerial canopy check is currently turned off by the office.',
                'code' => 'AERIAL_DISABLED',
            ], 409);
        }

        $max = (int) config('caneguard.aerial.max_side_px', 10000);
        $validated = $request->validate([
            'client_uuid' => ['required', 'uuid'],
            'image' => [
                'required',
                File::image()->types(['jpg', 'jpeg', 'png', 'webp'])
                    ->max((int) config('caneguard.aerial.max_upload_kib', 20480))
                    ->dimensions(Rule::dimensions()->maxWidth($max)->maxHeight($max)),
            ],
        ]);

        try {
            $analysis = $analyze->handle(
                $report,
                $user,
                $request->file('image'),
                clientUuid: strtolower((string) $validated['client_uuid']),
            );
        } catch (HttpException $exception) {
            // If the switch was turned off while ONNX inference was running, return 409 AERIAL_DISABLED
            // so the mobile queue handles it cleanly instead of treating 404 as a cancelled visit.
            if ($exception->getStatusCode() === 404 && ! AerialSwitch::enabled()) {
                return response()->json([
                    'message' => 'Aerial canopy check is currently turned off by the office.',
                    'code' => 'AERIAL_DISABLED',
                ], 409);
            }

            throw $exception;
        }

        $freshAssignment = $assignment->fresh(['report.aerialAnalyses']) ?? $assignment;

        return response()->json([
            'data' => [
                'analysis' => [
                    'uuid' => $analysis->uuid,
                    'client_uuid' => $analysis->client_uuid,
                    'assignment_uuid' => $assignment->uuid,
                ],
                'aerial_check' => MobileFieldValidationAssignmentResource::aerialCheckPayload($freshAssignment),
            ],
        ], 201);
    }
}
