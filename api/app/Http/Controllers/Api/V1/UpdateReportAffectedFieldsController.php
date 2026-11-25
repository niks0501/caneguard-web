<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateReportAffectedFieldsRequest;
use App\Http\Resources\ReportAffectedFieldResource;
use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class UpdateReportAffectedFieldsController extends Controller
{
    public function __invoke(
        UpdateReportAffectedFieldsRequest $request,
        Report $report,
    ): JsonResponse {
        $data = $request->validated();
        $updated = DB::transaction(function () use ($report, $data): Report {
            $locked = Report::query()
                ->lockForUpdate()
                ->findOrFail($report->getKey());

            abort_unless(
                (int) $locked->lock_version === (int) $data['expected_version'],
                409,
            );

            $desired = collect($data['affected_fields'])
                ->mapWithKeys(fn (array $field): array => [
                    (int) $field['field_survey_id'] => array_key_exists('loss_rate_percent', $field)
                        ? ['loss_rate_percent' => $field['loss_rate_percent'] === null
                            ? null
                            : round((float) $field['loss_rate_percent'], 2)]
                        : [],
                ])
                ->all();
            $current = $locked->affectedFieldSurveys()
                ->get(['field_surveys.id'])
                ->keyBy(fn ($fieldSurvey): int => (int) $fieldSurvey->getKey());
            $changed = $current->count() !== count($desired)
                || $current->keys()->diff(array_keys($desired))->isNotEmpty();

            if (! $changed) {
                foreach ($desired as $fieldSurveyId => $attributes) {
                    if (! array_key_exists('loss_rate_percent', $attributes)) {
                        continue;
                    }
                    $stored = $current->get($fieldSurveyId)->pivot->loss_rate_percent;
                    if (($stored === null ? null : round((float) $stored, 2)) !== $attributes['loss_rate_percent']) {
                        $changed = true;
                        break;
                    }
                }
            }

            if ($changed) {
                $locked->affectedFieldSurveys()->sync($desired);
                $locked->update([
                    'lock_version' => ((int) $locked->lock_version) + 1,
                ]);
            }

            return $locked->load('affectedFieldSurveys.inspector');
        }, attempts: 3);

        return response()->json([
            'data' => [
                'affected_fields' => ReportAffectedFieldResource::collection(
                    $updated->affectedFieldSurveys,
                )->resolve($request),
                'version' => (int) $updated->lock_version,
                'updated_at' => $updated->updated_at->utc()->toISOString(),
            ],
        ])->header('Cache-Control', 'private, no-store');
    }
}
