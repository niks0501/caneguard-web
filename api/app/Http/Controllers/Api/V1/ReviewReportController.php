<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Notifications\CreateLifecycleNotifications;
use App\Actions\Reports\RecordReportReferral;
use App\Http\Controllers\Controller;
use App\Http\Requests\ReviewReportRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use App\Models\ReportAudit;
use App\Models\ReportReferral;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

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
        CreateLifecycleNotifications $notifications,
        RecordReportReferral $recordReferral,
    ): ReportResource {
        $data = $request->validated();

        if ($this->isNewReferral($report, $data)) {
            $referralData = [
                'destination' => trim($data['referral_destination']),
                'reference' => trim($data['referral_reference']),
                'referral_date' => $data['referral_date'],
                'due_date' => $data['referral_due_date'] ?? null,
                'expert_name' => isset($data['expert_name'])
                    ? trim((string) $data['expert_name'])
                    : null,
                'expert_contact' => isset($data['expert_contact'])
                    ? trim((string) $data['expert_contact'])
                    : null,
                'note' => isset($data['referral_note'])
                    ? trim((string) $data['referral_note'])
                    : null,
                'consult_status' => $data['consult_status'] ?? null,
                'expected_version' => $data['expected_version'],
            ];
            foreach ([
                'notes' => 'office_notes',
                'authority_classified_condition' => 'authority_classified_condition',
                'verification_outcome' => 'verification_outcome',
            ] as $input => $key) {
                if (array_key_exists($input, $data)) {
                    $referralData[$key] = $data[$input];
                }
            }

            $updated = $recordReferral->handle(
                $request->user(),
                $report,
                $referralData,
            );

            return new ReportResource($updated->load([
                'reporter',
                'reviewer',
                'fieldValidationAssignment.assignee',
                'fieldValidationAssignment.assignedBy',
                'classScores',
                'symptoms',
                'qualityWarnings',
                'referral.referredBy',
                'referral.responseRecordedBy',
                'referral.findingRecordedBy',
                'referral.officeReviewer',
                'referrals',
                'audits.actor',
            ]));
        }

        $updated = DB::transaction(function () use ($request, $report, $data, $notifications): Report {
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
                'field_validation_state',
                'field_validation_assignee_uuid',
                'field_validation_target_date',
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

                $assignmentSelected = ($data['field_validation_state'] ?? null)
                    === Report::FIELD_VALIDATION_STATE_ASSIGNED
                    || filled($data['field_validation_assignee_uuid'] ?? null);
                if ($assignmentSelected) {
                    $lifecycle['field_validation_state'] = Report::FIELD_VALIDATION_STATE_ASSIGNED;
                } elseif (array_key_exists('field_validation_state', $data)) {
                    $lifecycle['field_validation_state'] = $data['field_validation_state'];
                }

                $reviewUpdate = [
                    'review_status' => Report::legacyReviewStatusForLifecycle($lifecycle),
                ];

                foreach ([
                    'case_state',
                    'verification_outcome',
                    'field_validation_state',
                ] as $dimension) {
                    if (array_key_exists($dimension, $data)
                        || ($dimension === 'field_validation_state' && $assignmentSelected)
                    ) {
                        $reviewUpdate[$dimension] = $lifecycle[$dimension];
                    }
                }
            }

            $reviewLifecycle = $locked->lifecycleSnapshot();
            if (($reviewUpdate['case_state'] ?? $reviewLifecycle['case_state']) === Report::CASE_STATE_CLOSED
                && $reviewLifecycle['referral_state'] === Report::REFERRAL_STATE_REFERRED
                && $locked->referrals()
                    ->whereIn('consult_status', ReportReferral::activeStatuses())
                    ->exists()
            ) {
                throw ValidationException::withMessages([
                    'case_state' => 'A referred case must remain open until an expert response is recorded.',
                ]);
            }

            $assignmentSelected = ($reviewUpdate['field_validation_state'] ?? null)
                === Report::FIELD_VALIDATION_STATE_ASSIGNED;
            if ($assignmentSelected
                && ($reviewUpdate['case_state'] ?? $locked->lifecycleSnapshot()['case_state'])
                    !== Report::CASE_STATE_OPEN
            ) {
                throw ValidationException::withMessages([
                    'field_validation_state' => 'Only open cases can be assigned for field validation.',
                ]);
            }
            $assignmentRemoved = ($reviewUpdate['field_validation_state'] ?? null)
                === Report::FIELD_VALIDATION_STATE_UNASSIGNED
                && array_key_exists('field_validation_state', $reviewUpdate);
            $assignmentForNotification = null;
            $existingAssignment = $locked->fieldValidationAssignment()->first();
            $assignmentWasChanged = false;

            if (($assignmentSelected || $assignmentRemoved)
                && $existingAssignment?->completion()->exists()
            ) {
                throw ValidationException::withMessages([
                    'field_validation_state' => 'Completed validation evidence cannot be reassigned or removed.',
                ]);
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

            if ($assignmentSelected) {
                $assignee = User::query()
                    ->where('uuid', $data['field_validation_assignee_uuid'])
                    ->where('role', User::ROLE_FIELD_REPORTER)
                    ->firstOrFail();
                $targetVisitDate = array_key_exists('field_validation_target_date', $data)
                    ? $data['field_validation_target_date']
                    : $existingAssignment?->target_visit_date?->format('Y-m-d');
                $assignmentForNotification = $locked->fieldValidationAssignment()->updateOrCreate(
                    [],
                    [
                        'assignee_id' => $assignee->getKey(),
                        'assigned_by_id' => $request->user()->getKey(),
                        'target_visit_date' => $targetVisitDate,
                        'activated_at' => $existingAssignment?->activated_at ?? $reviewUpdate['reviewed_at'],
                    ],
                );
                $assignmentWasChanged = $existingAssignment === null
                    || (string) $existingAssignment->assignee_id !== (string) $assignmentForNotification->assignee_id
                    || $existingAssignment->target_visit_date?->format('Y-m-d') !== $assignmentForNotification->target_visit_date?->format('Y-m-d');
            } elseif ($assignmentRemoved) {
                $locked->fieldValidationAssignment()->delete();
            }

            if ($assignmentForNotification && $assignmentWasChanged) {
                if ($existingAssignment === null) {
                    $notifications->assignmentCreated($assignmentForNotification);
                } else {
                    $notifications->assignmentChanged(
                        $assignmentForNotification,
                        $assignmentForNotification->updated_at?->utc()->toISOString() ?? (string) $locked->lock_version,
                    );
                }
            }

            if (! $assignmentSelected && $this->isFinalOfficeReview($data, $reviewUpdate)) {
                $notifications->officeReviewCompleted($locked);
            }

            return $locked;
        }, attempts: 3);

        return new ReportResource($updated->load([
            'reporter',
            'reviewer',
            'canonicalReport',
            'fieldValidationAssignment.assignee',
            'fieldValidationAssignment.assignedBy',
            'classScores',
            'symptoms',
            'qualityWarnings',
            'referral.referredBy',
            'referral.responseRecordedBy',
            'referral.findingRecordedBy',
            'referral.officeReviewer',
            'referrals',
            'audits.actor',
        ]));
    }

    private function isNewReferral(Report $report, array $data): bool
    {
        return ($data['action_taken'] ?? null) === Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION
            && $report->lifecycleSnapshot()['referral_state'] === Report::REFERRAL_STATE_NOT_REFERRED;
    }

    /**
     * A review is attention-worthy only when it records a final office
     * finding/disposition. Notes and metadata corrections remain quiet.
     *
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $reviewUpdate
     */
    private function isFinalOfficeReview(array $data, array $reviewUpdate): bool
    {
        if (($reviewUpdate['case_state'] ?? null) === Report::CASE_STATE_CLOSED) {
            return true;
        }

        if (in_array($data['status'] ?? null, [
            Report::STATUS_VERIFIED_BY_STAFF,
            Report::STATUS_UNABLE_TO_VERIFY,
            Report::STATUS_RESOLVED,
        ], true)) {
            return true;
        }

        if (array_key_exists('verification_outcome', $data)
            && $data['verification_outcome'] !== Report::VERIFICATION_OUTCOME_NOT_DETERMINED
        ) {
            return true;
        }

        return array_key_exists('action_taken', $data)
            && $data['action_taken'] !== null
            && $data['action_taken'] !== Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION;
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
