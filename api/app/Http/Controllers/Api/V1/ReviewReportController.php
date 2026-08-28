<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReviewReportRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use App\Models\ReportAudit;
use Illuminate\Support\Facades\DB;

class ReviewReportController extends Controller
{
    /**
     * Apply an explicit office review without coupling verification to closure.
     *
     * The legacy `status` input is kept as a compatibility path for old
     * clients. New inputs update only the dimensions they include.
     */
    public function __invoke(
        ReviewReportRequest $request,
        Report $report,
    ): ReportResource {
        $data = $request->validated();

        $updated = DB::transaction(function () use ($request, $report, $data): Report {
            $locked = Report::query()
                ->lockForUpdate()
                ->findOrFail($report->getKey());

            abort_unless(
                $locked->lock_version === $data['expected_version'],
                409,
            );

            $hasIndependentLifecycle = collect([
                'case_state',
                'verification_outcome',
                'action_taken',
            ])->contains(
                fn (string $key): bool => array_key_exists($key, $data),
            );

            if (array_key_exists('status', $data) && ! $hasIndependentLifecycle) {
                $legacyLifecycle = Report::lifecycleForReviewStatus($data['status']);
                $reviewUpdate = [
                    'review_status' => $data['status'],
                    'case_state' => $legacyLifecycle['case_state'],
                    'verification_outcome' => $legacyLifecycle['verification_outcome'],
                ];
            } else {
                $lifecycle = $locked->lifecycleSnapshot();

                foreach ([
                    'case_state',
                    'verification_outcome',
                ] as $dimension) {
                    if (array_key_exists($dimension, $data)) {
                        $lifecycle[$dimension] = $data[$dimension];
                    }
                }

                $reviewUpdate = [
                    'review_status' => Report::legacyReviewStatusForLifecycle($lifecycle),
                ];

                if (array_key_exists('case_state', $data)) {
                    $reviewUpdate['case_state'] = $data['case_state'];
                }

                if (array_key_exists('verification_outcome', $data)) {
                    $reviewUpdate['verification_outcome'] = $data['verification_outcome'];
                }
            }

            foreach ([
                'notes' => 'review_notes',
                'authority_classified_condition' => 'authority_classified_condition',
                'action_taken' => 'action_taken',
            ] as $input => $column) {
                if (array_key_exists($input, $data)) {
                    $reviewUpdate[$column] = $data[$input];
                }
            }

            $reviewUpdate['reviewer_id'] = $request->user()->getKey();
            $reviewUpdate['reviewed_at'] = now()->utc();
            $reviewUpdate['lock_version'] = $locked->lock_version + 1;

            $this->applyMetadataCorrections(
                $locked,
                $data['metadata_corrections'] ?? [],
                $data['correction_reason'] ?? null,
                $request->user()->getKey(),
                $reviewUpdate['reviewed_at'],
            );

            $locked->update($reviewUpdate);

            return $locked;
        }, attempts: 3);

        return new ReportResource($updated->load([
            'reporter',
            'reviewer',
            'classScores',
            'symptoms',
            'qualityWarnings',
            'audits.actor',
        ]));
    }

    /**
     * @param  array<string, mixed>  $corrections
     */
    private function applyMetadataCorrections(
        Report $report,
        array $corrections,
        ?string $reason,
        int|string $actorId,
        mixed $timestamp,
    ): void {
        if ($corrections === []) {
            return;
        }

        foreach ($corrections as $field => $correctedValue) {
            $correctedValue = $this->normalizeCorrectionValue($field, $correctedValue);
            $originalValue = $report->getAttribute($field);

            if ($this->sameValue($originalValue, $correctedValue)) {
                continue;
            }

            ReportAudit::query()->create([
                'report_id' => $report->getKey(),
                'actor_id' => $actorId,
                'field' => $field,
                'original_value' => $originalValue,
                'corrected_value' => $correctedValue,
                'reason' => (string) $reason,
                'created_at' => $timestamp,
            ]);

            $report->setAttribute($field, $correctedValue);
        }
    }

    private function normalizeCorrectionValue(string $field, mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        if (! in_array($field, [
            'barangay',
            'farmer_or_farm_owner_name',
            'province',
            'municipality',
            'location_source',
        ], true)) {
            return $value;
        }

        $trimmed = trim($value);

        return $trimmed === '' && $field !== 'barangay' ? null : $trimmed;
    }

    private function sameValue(mixed $original, mixed $corrected): bool
    {
        if ($original === null || $corrected === null) {
            return $original === $corrected;
        }

        if (is_numeric($original) && is_numeric($corrected)) {
            return (float) $original === (float) $corrected;
        }

        return (string) $original === (string) $corrected;
    }
}
