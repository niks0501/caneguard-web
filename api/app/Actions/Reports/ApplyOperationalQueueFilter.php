<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use InvalidArgumentException;

final class ApplyOperationalQueueFilter
{
    /**
     * Apply one of the dashboard's operational queue definitions to a report
     * query. These predicates are shared by dashboard counts and workspaces so
     * a queue count always opens the same set of records.
     */
    public function handle(Builder $query, string $queue): Builder
    {
        // Linked duplicates remain visible on the case detail page but are not
        // active work for any operational queue.
        $query->whereNull('canonical_report_id');

        return match ($queue) {
            Report::QUEUE_NEEDS_REVIEW => $this->needsReview($query),
            Report::QUEUE_NEEDS_VISIT => $this->needsVisit($query),
            Report::QUEUE_FOLLOW_UP_DUE => $this->followUpDue($query),
            Report::QUEUE_UPCOMING => $this->upcoming($query),
            Report::QUEUE_UNVERIFIED_NO_ACTIVE_WORK => $this->unverifiedNoActiveWork($query),
            default => throw new InvalidArgumentException("Unsupported operational queue: {$queue}"),
        };
    }

    private function needsReview(Builder $query): Builder
    {
        return $query
            ->where('case_state', Report::CASE_STATE_OPEN)
            ->where(
                'verification_outcome',
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            )
            ->where(function (Builder $query): void {
                $query
                    ->whereNull('action_taken')
                    ->orWhere('action_taken', Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION);
            })
            ->where(function (Builder $query): void {
                $query
                    ->where(
                        'field_validation_state',
                        Report::FIELD_VALIDATION_STATE_COMPLETED,
                    )
                    ->orWhere(function (Builder $query): void {
                        $query
                            ->where(
                                'field_validation_state',
                                Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                            )
                            // Legacy for_field_validation rows were migrated
                            // without an assignee. Keep them in Needs Visit,
                            // not both queues.
                            ->where(
                                'review_status',
                                '!=',
                                Report::STATUS_FOR_FIELD_VALIDATION,
                            );
                    });
            });
    }

    private function needsVisit(Builder $query): Builder
    {
        return $query
            ->where('case_state', Report::CASE_STATE_OPEN)
            ->where(
                'field_validation_state',
                '!=',
                Report::FIELD_VALIDATION_STATE_COMPLETED,
            )
            ->where(function (Builder $query): void {
                $query
                    ->whereIn('field_validation_state', [
                        Report::FIELD_VALIDATION_STATE_ASSIGNED,
                        Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
                    ])
                    ->orWhere(function (Builder $query): void {
                        $query
                            ->where(
                                'field_validation_state',
                                Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                            )
                            ->where(
                                'review_status',
                                Report::STATUS_FOR_FIELD_VALIDATION,
                            );
                    });
            });
    }

    /** Scheduled and overdue queues are calendar subsets of Needs Visit. */
    private function followUpDue(Builder $query): Builder
    {
        $today = CarbonImmutable::now('Asia/Manila')->toDateString();

        return $this->scheduledOpenIncomplete($query)
            ->whereHas('fieldValidationAssignment', function (Builder $query) use ($today): void {
                $query
                    ->whereNotNull('target_visit_date')
                    ->whereDate('target_visit_date', '<', $today);
            });
    }

    private function upcoming(Builder $query): Builder
    {
        $today = CarbonImmutable::now('Asia/Manila')->toDateString();

        return $this->scheduledOpenIncomplete($query)
            ->whereHas('fieldValidationAssignment', function (Builder $query) use ($today): void {
                $query
                    ->whereNotNull('target_visit_date')
                    ->whereDate('target_visit_date', '>=', $today);
            });
    }

    private function scheduledOpenIncomplete(Builder $query): Builder
    {
        return $query
            ->where('case_state', Report::CASE_STATE_OPEN)
            ->where(
                'field_validation_state',
                '!=',
                Report::FIELD_VALIDATION_STATE_COMPLETED,
            );
    }

    private function unverifiedNoActiveWork(Builder $query): Builder
    {
        return $query
            ->where('case_state', Report::CASE_STATE_OPEN)
            ->where(
                'verification_outcome',
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            )
            ->where('field_validation_state', Report::FIELD_VALIDATION_STATE_UNASSIGNED)
            ->where('action_taken', '!=', Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION)
            ->whereNotNull('action_taken');
    }
}
