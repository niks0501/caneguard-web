<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Illuminate\Support\Facades\Schema;

/**
 * Build the read-only case history projection consumed by the office UI.
 *
 * History is intentionally assembled from the records that already own each
 * fact: review events, correction audits, field validation assignments, and
 * consults. Missing expansion tables are reported as unavailable rather than
 * being represented by guessed legacy events.
 */
final class BuildReportCaseHistory
{
    /**
     * @return array<int, string>
     */
    public function relations(): array
    {
        $relations = [
            'audits.actor',
            'fieldValidationAssignment.assignee',
            'fieldValidationAssignment.assignedBy',
            'fieldValidationAssignment.completion',
            'referrals.expert',
            'referrals.referredBy',
            'referrals.responseRecordedBy',
            'referrals.findingRecordedBy',
        ];

        if (Schema::hasTable('report_review_events')) {
            $relations[] = 'reviewEvents.actor';
        }

        return $relations;
    }

    /**
     * @return array{entries: array<int, array<string, mixed>>, available: bool, sources: array<string, bool>}
     */
    public function handle(Report $report): array
    {
        $entries = [];

        if ($report->relationLoaded('reviewEvents')) {
            foreach ($report->reviewEvents as $event) {
                $fields = [];
                if ($event->case_state !== null) {
                    $fields[] = ['label' => 'Case state', 'value' => $this->label($event->case_state)];
                }
                if ($event->action_taken !== null) {
                    $fields[] = ['label' => 'Action taken', 'value' => $this->label($event->action_taken)];
                }
                if ($event->authority_classified_condition !== null) {
                    $fields[] = [
                        'label' => 'Staff classification',
                        'value' => $this->label($event->authority_classified_condition),
                    ];
                }
                if ($event->verification_outcome !== null) {
                    $fields[] = [
                        'label' => 'Verification outcome',
                        'value' => $this->label($event->verification_outcome),
                    ];
                }

                $entries[] = $this->entry(
                    'review-'.$event->getKey(),
                    'review',
                    'Review',
                    $event->created_at,
                    $event->actor?->name ?? 'Authorized reviewer',
                    $fields,
                    $event->notes,
                );
            }
        }

        if ($report->relationLoaded('audits')) {
            foreach ($report->audits as $audit) {
                if ($audit->field === Report::AUDIT_FIELD_CANONICAL_REPORT) {
                    continue;
                }

                $entries[] = $this->entry(
                    'correction-'.$audit->getKey(),
                    'correction',
                    'Correction',
                    $audit->created_at,
                    $audit->actor?->name ?? 'Authorized reviewer',
                    [
                        ['label' => 'Field', 'value' => $this->label($audit->field)],
                        [
                            'label' => 'Correction',
                            'value' => $this->value($audit->original_value).' to '.$this->value($audit->corrected_value),
                        ],
                        ['label' => 'Reason', 'value' => $audit->reason],
                    ],
                );
            }
        }

        if ($report->relationLoaded('fieldValidationAssignment')
            && $report->fieldValidationAssignment !== null
        ) {
            $assignment = $report->fieldValidationAssignment;
            $entries[] = $this->entry(
                'field-validation-assign-'.$assignment->uuid,
                'field_validation',
                'Field validation',
                $assignment->activated_at,
                $assignment->assignedBy?->name ?? 'Office reviewer',
                [
                    ['label' => 'Assignment', 'value' => 'Assigned to '.($assignment->assignee?->name ?? 'Unavailable')],
                    ...($assignment->target_visit_date ? [
                        ['label' => 'Target visit', 'value' => $assignment->target_visit_date->format('Y-m-d')],
                    ] : []),
                ],
            );

            if ($assignment->relationLoaded('completion') && $assignment->completion !== null) {
                $completion = $assignment->completion;
                $entries[] = $this->entry(
                    'field-validation-complete-'.$assignment->uuid,
                    'field_validation',
                    'Field validation',
                    $completion->visited_at ?? $assignment->updated_at,
                    $assignment->assignee?->name ?? 'Field inspector',
                    [
                        ['label' => 'Action taken', 'value' => $completion->action_taken],
                        ['label' => 'Observation', 'value' => $completion->field_observation],
                        ['label' => 'Finding', 'value' => $completion->field_finding],
                    ],
                );
            }
        }

        if ($report->relationLoaded('referrals')) {
            foreach ($report->referrals as $consult) {
                $entries[] = $this->entry(
                    'consult-'.$consult->getKey(),
                    'referral',
                    'Referral',
                    $consult->referral_date,
                    $consult->referredBy?->name ?? 'Authorized reviewer',
                    [
                        ['label' => 'Destination', 'value' => $consult->destination],
                        ['label' => 'Reference', 'value' => $consult->reference],
                        ...($consult->due_date ? [
                            ['label' => 'Due date', 'value' => $consult->due_date->format('Y-m-d')],
                        ] : []),
                        ...($consult->expert_name ? [
                            ['label' => 'Expert', 'value' => $consult->expert_name],
                        ] : []),
                    ],
                    $consult->note,
                );

                if ($consult->response_date !== null) {
                    $entries[] = $this->entry(
                        'consult-response-'.$consult->getKey(),
                        'referral',
                        'Referral',
                        $consult->response_date,
                        $consult->responseRecordedBy?->name
                            ?? $consult->expert?->name
                            ?? $consult->expert_name
                            ?? 'Expert',
                        [
                            ['label' => 'Response', 'value' => 'Expert response received'],
                            ...($consult->finding_summary ? [
                                ['label' => 'Finding', 'value' => $consult->finding_summary],
                            ] : []),
                        ],
                        $consult->finding_details,
                    );
                }
            }
        }

        usort($entries, function (array $left, array $right): int {
            return strcmp($right['timestamp'], $left['timestamp']);
        });

        $sources = [
            'review_events' => Schema::hasTable('report_review_events')
                && $report->relationLoaded('reviewEvents'),
            'corrections' => Schema::hasTable('report_audits')
                && $report->relationLoaded('audits'),
            'assignments' => Schema::hasTable('field_validation_assignments')
                && $report->relationLoaded('fieldValidationAssignment'),
            'consults' => Schema::hasTable('report_referrals')
                && $report->relationLoaded('referrals'),
        ];

        return [
            'entries' => $entries,
            'available' => ! in_array(false, $sources, true),
            'sources' => $sources,
        ];
    }

    /**
     * @param  array<int, array{label: string, value: string|null}>  $fields
     * @return array<string, mixed>
     */
    private function entry(
        string $id,
        string $type,
        string $typeLabel,
        mixed $timestamp,
        string $actor,
        array $fields,
        ?string $notes = null,
    ): array {
        return [
            'id' => $id,
            'type' => $type,
            'type_label' => $typeLabel,
            'timestamp' => $timestamp?->utc()->toISOString() ?? '',
            'actor' => $actor,
            'fields' => $fields,
            'notes' => $notes,
        ];
    }

    private function label(?string $value): string
    {
        return $value === null ? '' : str_replace('_', ' ', ucfirst($value));
    }

    private function value(mixed $value): string
    {
        if ($value === null || $value === '') {
            return 'Not provided';
        }

        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }

        return (string) $value;
    }
}
