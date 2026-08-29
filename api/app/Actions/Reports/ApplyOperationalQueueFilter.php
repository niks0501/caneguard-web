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
        return match ($queue) {
            Report::QUEUE_NEEDS_REVIEW => $this->needsReview($query),
            Report::QUEUE_NEEDS_VISIT => $this->needsVisit($query),
            Report::QUEUE_FOLLOW_UP_DUE => $this->followUpDue($query),
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
            ->whereNull('action_taken')
            ->where('referral_state', '!=', Report::REFERRAL_STATE_REFERRED)
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

    private function followUpDue(Builder $query): Builder
    {
        $today = CarbonImmutable::now()->startOfDay()->toDateString();

        return $query
            ->where('case_state', Report::CASE_STATE_OPEN)
            ->where(
                'field_validation_state',
                '!=',
                Report::FIELD_VALIDATION_STATE_COMPLETED,
            )
            ->whereHas('fieldValidationAssignment', function (Builder $query) use ($today): void {
                $query
                    ->whereNotNull('target_visit_date')
                    ->whereDate('target_visit_date', '<', $today);
            });
    }
}
