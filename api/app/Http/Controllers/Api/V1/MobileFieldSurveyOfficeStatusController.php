<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\FieldSurvey;
use App\Models\Report;
use App\Security\DistrictAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What the office decided about each field map the signed-in inspector sent:
 * `confirmed` when a case links it, `wrong_field` when the case it was attached
 * to now links a different map, `pending` otherwise. Derived, never stored.
 */
class MobileFieldSurveyOfficeStatusController extends Controller
{
    /** Most recent maps reported; older ones no longer need an answer on the phone. */
    public const LIMIT = 200;

    public function __invoke(Request $request, DistrictAccess $access): JsonResponse
    {
        $districtId = $access->pilotId();
        $surveys = $districtId === null
            ? collect()
            : FieldSurvey::query()
                ->where('inspector_id', $request->user()->getKey())
                ->where('district_id', $districtId)
                ->orderByDesc('id')
                ->limit(self::LIMIT)
                ->get(['id', 'client_uuid']);

        $reports = $surveys->isEmpty()
            ? collect()
            : Report::query()
                ->where('district_id', $districtId)
                ->whereIn('field_survey_client_uuid', $surveys->pluck('client_uuid')->all())
                ->with('affectedFieldSurveys:field_surveys.id')
                ->get(['id', 'field_survey_client_uuid']);

        $rank = ['pending' => 0, 'wrong_field' => 1, 'confirmed' => 2];
        $verdicts = [];
        foreach ($reports->groupBy('field_survey_client_uuid') as $clientUuid => $attached) {
            $survey = $surveys->firstWhere('client_uuid', $clientUuid);
            foreach ($attached as $report) {
                $linked = $report->affectedFieldSurveys->modelKeys();
                $verdict = match (true) {
                    in_array($survey->getKey(), $linked, true) => 'confirmed',
                    $linked !== [] => 'wrong_field',
                    default => 'pending',
                };
                if (! isset($verdicts[$clientUuid]) || $rank[$verdict] > $rank[$verdicts[$clientUuid]]) {
                    $verdicts[$clientUuid] = $verdict;
                }
            }
        }

        return response()->json([
            'data' => collect($verdicts)
                ->map(fn (string $verdict, string $clientUuid): array => [
                    'client_uuid' => $clientUuid,
                    'verdict' => $verdict,
                ])
                ->values()
                ->all(),
        ])->header('Cache-Control', 'private, no-store');
    }
}
