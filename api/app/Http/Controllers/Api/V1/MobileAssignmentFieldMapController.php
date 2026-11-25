<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\FieldSurvey;
use App\Models\FieldValidationAssignment;
use App\Models\User;
use App\Security\DistrictAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The field map of a case the signed-in inspector is assigned to, read-only, so
 * the plot outline can be reused for the visit. Only the assignee can read it,
 * and only for that case: this is never a way to browse other inspectors' maps.
 */
class MobileAssignmentFieldMapController extends Controller
{
    public function __invoke(Request $request, FieldValidationAssignment $assignment): JsonResponse
    {
        $report = $assignment->report;
        abort_unless(
            $request->user()?->role === User::ROLE_FIELD_REPORTER
                && (string) $assignment->assignee_id === (string) $request->user()->getKey()
                && app(DistrictAccess::class)->report($request->user(), $report, true),
            403,
        );

        $report->loadMissing(['affectedFieldSurveys.inspector', 'attachedFieldSurvey.inspector']);
        $confirmed = $report->affectedFieldSurveys->sortBy('id')->first();
        $attached = $report->attachedFieldSurvey;
        if ($attached !== null && (int) $attached->district_id !== (int) $report->district_id) {
            $attached = null;
        }
        $survey = $confirmed ?? $attached;

        return response()->json([
            'data' => $survey === null ? null : $this->map($survey, $confirmed !== null ? 'confirmed' : 'attached'),
        ])->header('Cache-Control', 'private, no-store');
    }

    /**
     * @return array<string, mixed>
     */
    private function map(FieldSurvey $survey, string $source): array
    {
        return [
            'field_survey_id' => (int) $survey->getKey(),
            'source' => $source,
            'label' => $survey->label,
            'geometry' => $survey->polygon,
            'area_sqm' => (float) $survey->area_sqm,
            'captured_at' => $survey->captured_at->utc()->format('Y-m-d\\TH:i:s.u\\Z'),
            'inspector' => ['name' => $survey->inspector->name],
        ];
    }
}
