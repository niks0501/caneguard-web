<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Notifications\CreateLifecycleNotifications;
use App\Actions\Reports\BuildReportCaseHistory;
use App\Actions\Reports\RecordReportReferral;
use App\Actions\Reports\RecordReportReviewEvent;
use App\Http\Controllers\Controller;
use App\Http\Requests\ReviewReportRequest;
use App\Http\Resources\ReportResource;
use App\Models\Advisory;
use App\Models\Report;
use App\Models\ReportAudit;
use App\Models\ReportReferral;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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
        RecordReportReviewEvent $recordReviewEvent,
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
                'expert_uuid' => $data['expert_uuid'] ?? null,
                'note' => isset($data['referral_note'])
                    ? trim((string) $data['referral_note'])
                    : null,
                'consult_status' => $data['consult_status'] ?? null,
                'advisory_uuid' => $data['advisory_uuid'] ?? null,
                'advisory_id' => $data['advisory_id'] ?? null,
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
                'advisory',
                'fieldValidationAssignment.assignee',
                'fieldValidationAssignment.assignedBy',
                'classScores',
                'symptoms',
                'qualityWarnings',
                'referral.referredBy',
                'referral.expert',
                'referral.responseRecordedBy',
                'referral.findingRecordedBy',
                'referral.officeReviewer',
                'referrals.expert',
                'audits.actor',
                ...$this->reviewEventRelations(),
            ]));
        }

        $advisoryForDelivery = null;
        $updated = DB::transaction(function () use ($request, $report, $data, $notifications, $recordReviewEvent, &$advisoryForDelivery): Report {
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
            $targetVisitDateChanged = false;
            $previousTargetVisitDate = $existingAssignment?->target_visit_date?->format('Y-m-d');

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

            if (array_key_exists('advisory_uuid', $data) || array_key_exists('advisory_id', $data)) {
                $advisoryForDelivery = null;
                if (filled($data['advisory_uuid'] ?? null) || filled($data['advisory_id'] ?? null)) {
                    $selectedAdvisory = Advisory::query()
                        ->when(
                            filled($data['advisory_uuid'] ?? null),
                            fn ($query) => $query->where('uuid', $data['advisory_uuid']),
                            fn ($query) => $query->whereKey($data['advisory_id']),
                        )
                        ->where('status', Advisory::STATUS_VALIDATED)
                        ->firstOrFail();
                    $sameDeliveredAdvisory = (string) $locked->advisory_id === (string) $selectedAdvisory->getKey()
                        && in_array($locked->advisory_delivery_state, [
                            Report::ADVISORY_DELIVERY_DELIVERED,
                            Report::ADVISORY_DELIVERY_ACKNOWLEDGED,
                        ], true);
                    if (! $sameDeliveredAdvisory) {
                        $advisoryForDelivery = $selectedAdvisory;
                        $reviewUpdate['advisory_id'] = $selectedAdvisory->getKey();
                        $reviewUpdate['advisory_selected_by_id'] = $request->user()->getKey();
                        $reviewUpdate['advisory_selected_at'] = now()->utc();
                        $reviewUpdate['advisory_delivery_state'] = Report::ADVISORY_DELIVERY_PENDING;
                        $reviewUpdate['advisory_delivered_at'] = null;
                        $reviewUpdate['advisory_acknowledged_at'] = null;
                    }
                } else {
                    $reviewUpdate['advisory_id'] = null;
                    $reviewUpdate['advisory_selected_by_id'] = null;
                    $reviewUpdate['advisory_selected_at'] = null;
                    $reviewUpdate['advisory_delivery_state'] = Report::ADVISORY_DELIVERY_NOT_SELECTED;
                    $reviewUpdate['advisory_delivered_at'] = null;
                    $reviewUpdate['advisory_acknowledged_at'] = null;
                }
            }

            $reviewUpdate['reviewer_id'] = $request->user()->getKey();
            $reviewUpdate['reviewed_at'] = now()->utc();
            $reviewUpdate['first_reviewed_at'] = $locked->first_reviewed_at
                ?? $reviewUpdate['reviewed_at'];
            $reviewUpdate['lock_version'] = $locked->lock_version + 1;

            $this->applyMetadataCorrections(
                $locked,
                $data['metadata_corrections'] ?? [],
                $data['correction_reason'] ?? null,
                $request->user()->getKey(),
                $reviewUpdate['reviewed_at'],
            );

            $locked->update($reviewUpdate);

            $recordReviewEvent->handle($locked, [
                'actor_id' => $request->user()->getKey(),
                'action_taken' => $reviewUpdate['action_taken'] ?? $locked->action_taken,
                'authority_classified_condition' => $reviewUpdate['authority_classified_condition'] ?? $locked->authority_classified_condition,
                'verification_outcome' => $reviewUpdate['verification_outcome'] ?? $locked->verification_outcome,
                'notes' => $reviewUpdate['review_notes'] ?? $locked->review_notes,
                'case_state' => $reviewUpdate['case_state'] ?? $locked->case_state,
                'created_at' => $reviewUpdate['reviewed_at'],
            ]);

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
                $targetVisitDateChanged = $existingAssignment !== null
                    && $previousTargetVisitDate !== $assignmentForNotification->target_visit_date?->format('Y-m-d');
                $assignmentWasChanged = $existingAssignment === null
                    || (string) $existingAssignment->assignee_id !== (string) $assignmentForNotification->assignee_id
                    || $targetVisitDateChanged;
                if ($targetVisitDateChanged) {
                    ReportAudit::query()->create([
                        'report_id' => $locked->getKey(),
                        'actor_id' => $request->user()->getKey(),
                        'field' => 'field_validation_target_date',
                        'original_value' => $previousTargetVisitDate,
                        'corrected_value' => $assignmentForNotification->target_visit_date?->format('Y-m-d'),
                        'reason' => trim((string) ($data['correction_reason'] ?? ''))
                            ?: 'Target visit date updated during office review.',
                        'created_at' => $reviewUpdate['reviewed_at'],
                    ]);
                }
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

            if (! $assignmentSelected
                && $advisoryForDelivery === null
                && $this->isFinalOfficeReview($data, $reviewUpdate)
            ) {
                $notifications->officeReviewCompleted($locked);
            }

            return $locked;
        }, attempts: 3);

        if ($advisoryForDelivery !== null) {
            $notifications->advisorySelected($updated, $advisoryForDelivery);
            $updated->refresh();
        }

        return new ReportResource($updated->load([
            'reporter',
            'reviewer',
            'advisory',
            'canonicalReport',
            'fieldValidationAssignment.assignee',
            'fieldValidationAssignment.assignedBy',
            'classScores',
            'symptoms',
            'qualityWarnings',
            'referral.referredBy',
            'referral.expert',
            'referral.responseRecordedBy',
            'referral.findingRecordedBy',
            'referral.officeReviewer',
            'referrals.expert',
            'audits.actor',
            ...$this->reviewEventRelations(),
        ]));
    }

    /**
     * Review history is optional while older deployments catch up to the
     * migration that introduced it.
     *
     * @return array<int, string>
     */
    private function reviewEventRelations(): array
    {
        $relations = app(BuildReportCaseHistory::class)->relations();

        if (Schema::hasTable('report_review_events')) {
            $relations[] = 'reviewEvents.actor';
        }

        return array_values(array_unique($relations));
    }

    private function isNewReferral(Report $report, array $data): bool
    {
        if (($data['action_taken'] ?? null) !== Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION) {
            return false;
        }

        return ! $report->referrals()
            ->whereIn('consult_status', ReportReferral::activeStatuses())
            ->exists();
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
