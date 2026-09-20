<?php

namespace App\Actions\Reports;

use App\Actions\Notifications\CreateLifecycleNotifications;
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
    public function __construct(
        private readonly CreateLifecycleNotifications $notifications,
    ) {}

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
        $completionUuid = (string) Str::uuid7();
        $photoPath = null;

        try {
            $result = DB::transaction(function () use (
                $data,
                $assignment,
                $completionUuid,
                $freshPhoto,
                $user,
                &$photoPath,
            ): array {
                // The completion check and lifecycle mutation must share the
                // assignment lock. Otherwise two requests can both pass the
                // check before either completion is persisted.
                // Review mutations lock the report before its assignment.
                // Keep the same order here so completion and review serialize
                // instead of observing different lifecycle snapshots.
                $report = Report::query()
                    ->lockForUpdate()
                    ->findOrFail($assignment->report_id);
                $locked = FieldValidationAssignment::query()
                    ->lockForUpdate()
                    ->findOrFail($assignment->getKey());
                $locked->setRelation('report', $report);
                if ($locked->assignee_id !== $user->getKey()) {
                    throw new FieldValidationCompletionConflict(
                        'This assignment does not belong to the authenticated field reporter.',
                    );
                }

                $existing = $locked->completion()->first();
                if ($existing) {
                    if ((string) $existing->client_uuid === (string) $data['client_uuid']) {
                        return [
                            'assignment' => $locked,
                            'completion' => $existing,
                            'created' => false,
                        ];
                    }

                    throw new FieldValidationCompletionConflict(
                        'This assignment already has a different completed validation.',
                    );
                }

                $lifecycle = $report->lifecycleSnapshot();

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

                if ($freshPhoto && $photoPath === null) {
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

                $completion = $locked->completion()->create([
                    'uuid' => $completionUuid,
                    'client_uuid' => $data['client_uuid'],
                    'field_observation' => $data['field_observation'],
                    'field_finding' => $data['field_finding'],
                    'action_taken' => $data['action_taken'],
                    'follow_up_outcome' => $data['follow_up_outcome'] ?? null,
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
                $this->notifications->fieldValidationCompleted($locked, $completion);

                return [
                    'assignment' => $locked,
                    'completion' => $completion,
                    'created' => true,
                ];
            }, attempts: 3);
        } catch (Throwable $exception) {
            if ($photoPath) {
                $this->deleteFailedPhoto($photoPath);
            }
            throw $exception;
        }

        if (! $result['created'] && $photoPath) {
            $this->deleteFailedPhoto($photoPath);
        }

        return $this->loadResult(
            $result['assignment'],
            $result['completion'],
            $result['created'],
        );
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
