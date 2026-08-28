<?php

namespace App\Actions\Reports;

use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class CompleteFieldValidationAssignment
{
    /**
     * @param  array<string, mixed>  $data
     * @return array{assignment: FieldValidationAssignment, completion: FieldValidationCompletion, created: bool, report: Report}
     */
    public function handle(
        User $user,
        FieldValidationAssignment $assignment,
        array $data,
        ?UploadedFile $freshPhoto,
    ): array {
        $existing = $assignment->completion()->first();
        if ($existing) {
            if ((string) $existing->client_uuid === (string) $data['client_uuid']) {
                return $this->loadResult($assignment, $existing, false);
            }

            throw new FieldValidationCompletionConflict(
                'This assignment already has a different completed validation.',
            );
        }

        $locked = FieldValidationAssignment::query()
            ->with('report')
            ->lockForUpdate()
            ->findOrFail($assignment->getKey());
        $report = $locked->report;
        $lifecycle = $report->lifecycleSnapshot();

        if ($locked->assignee_id !== $user->getKey()) {
            throw new FieldValidationCompletionConflict(
                'This assignment does not belong to the authenticated field reporter.',
            );
        }
        if ($lifecycle['case_state'] !== Report::CASE_STATE_OPEN) {
            throw new FieldValidationCompletionConflict(
                'Only open cases can receive field validation evidence.',
            );
        }
        if ($lifecycle['field_validation_state'] === Report::FIELD_VALIDATION_STATE_COMPLETED) {
            throw new FieldValidationCompletionConflict(
                'This assignment is already marked completed.',
            );
        }

        $completionUuid = (string) Str::uuid7();
        $photoPath = null;
        if ($freshPhoto) {
            $extension = $freshPhoto->guessExtension() ?: 'jpg';
            $photoPath = Storage::disk('local')->putFileAs(
                'field-validation/'.$locked->uuid,
                $freshPhoto,
                $completionUuid.'.'.$extension,
            );
            if (! is_string($photoPath)) {
                throw new RuntimeException('The field validation photo could not be stored.');
            }
        }

        try {
            $completion = DB::transaction(function () use (
                $data,
                $locked,
                $photoPath,
                $completionUuid,
                $report,
                $freshPhoto,
            ): FieldValidationCompletion {
                $completion = $locked->completion()->create([
                    'uuid' => $completionUuid,
                    'client_uuid' => $data['client_uuid'],
                    'field_observation' => $data['field_observation'],
                    'field_finding' => $data['field_finding'],
                    'action_taken' => $data['action_taken'],
                    'visited_at' => $data['visited_at'],
                    'gps_outcome' => $data['gps_outcome'],
                    'gps_attempted_at' => $data['gps_attempted_at'],
                    'gps_latitude' => $data['gps_latitude'] ?? null,
                    'gps_longitude' => $data['gps_longitude'] ?? null,
                    'gps_accuracy' => $data['gps_accuracy'] ?? null,
                    'fresh_photo_path' => $photoPath,
                    'fresh_photo_mime_type' => $freshPhoto?->getMimeType(),
                    'fresh_photo_size_bytes' => $freshPhoto?->getSize(),
                ]);

                $report->update([
                    'review_status' => Report::legacyReviewStatusForLifecycle([
                        ...$report->lifecycleSnapshot(),
                        'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
                    ]),
                    'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
                    'lock_version' => $report->lock_version + 1,
                ]);
                $locked->touch();

                return $completion;
            }, attempts: 3);
        } catch (Throwable $exception) {
            if ($photoPath) {
                $this->deleteFailedPhoto($photoPath);
            }
            throw $exception;
        }

        return $this->loadResult($locked, $completion, true);
    }

    /**
     * @return array{assignment: FieldValidationAssignment, completion: FieldValidationCompletion, created: bool, report: Report}
     */
    private function loadResult(
        FieldValidationAssignment $assignment,
        FieldValidationCompletion $completion,
        bool $created,
    ): array {
        $loaded = $assignment->fresh([
            'assignee',
            'report.reporter',
            'completion',
        ]);
        if (! $loaded) {
            throw new RuntimeException('The field validation assignment could not be reloaded.');
        }

        return [
            'assignment' => $loaded,
            'completion' => $loaded->completion ?? $completion,
            'created' => $created,
            'report' => $loaded->report,
        ];
    }

    private function deleteFailedPhoto(string $path): void
    {
        try {
            Storage::disk('local')->delete($path);
        } catch (Throwable) {
            // The original completion failure remains the actionable error.
        }
    }
}

class FieldValidationCompletionConflict extends RuntimeException {}
