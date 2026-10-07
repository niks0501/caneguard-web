<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use InvalidArgumentException;

class ApplyReportFilters
{
    private const TIMEZONE = 'Asia/Manila';

    private const DATE_COLUMNS = [
        'submitted_at',
        'observed_at',
    ];

    /**
     * @param  array<string, mixed>  $filters
     */
    public function handle(
        Builder $query,
        array $filters,
        string $dateColumn = 'submitted_at',
    ): Builder {
        if (! in_array($dateColumn, self::DATE_COLUMNS, true)) {
            throw new InvalidArgumentException('Unsupported report date column.');
        }

        return $query
            ->when($filters['search'] ?? null, function (Builder $query, string $search) {
                $pattern = '%'.$this->escapeLike($search).'%';

                $query->where(function (Builder $query) use ($pattern) {
                    $query
                        ->whereRaw(
                            "reference_code LIKE ? ESCAPE '!'",
                            [$pattern],
                        )
                        ->orWhereRaw(
                            "barangay LIKE ? ESCAPE '!'",
                            [$pattern],
                        )
                        ->orWhereRaw(
                            "farmer_or_farm_owner_name LIKE ? ESCAPE '!'",
                            [$pattern],
                        )
                        ->orWhereHas(
                            'reporter',
                            fn (Builder $reporter) => $reporter->whereRaw(
                                "name LIKE ? ESCAPE '!'",
                                [$pattern],
                            ),
                        );
                });
            })
            ->when(
                $filters['status'] ?? null,
                fn (Builder $query, string $status) => $query
                    ->where('review_status', $status),
            )
            ->when(
                $filters['case_state'] ?? null,
                fn (Builder $query, string $state) => $query
                    ->where('case_state', $state),
            )
            ->when(
                $filters['verification_outcome'] ?? null,
                fn (Builder $query, string $outcome) => $query
                    ->where('verification_outcome', $outcome),
            )
            ->when(
                $filters['field_validation_state'] ?? null,
                fn (Builder $query, string $state) => $query
                    ->where('field_validation_state', $state),
            )
            ->when(
                $filters['authority_classified_condition'] ?? null,
                fn (Builder $query, string $condition) => $query
                    ->where('authority_classified_condition', $condition),
            )
            ->when(
                $filters['concern'] ?? null,
                fn (Builder $query, string $concern) => $query
                    ->where(
                        'reporter_suspected_condition',
                        strtoupper($concern) === Report::REPORTER_CONCERN_RSSI
                            ? Report::REPORTER_CONCERN_RSSI
                            : $concern,
                    ),
            )
            ->when(
                $filters['follow_up_outcome'] ?? null,
                fn (Builder $query, string $outcome) => $query->whereHas(
                    'fieldValidationAssignment.completion',
                    fn (Builder $completion) => $completion->where('follow_up_outcome', $outcome),
                ),
            )
            ->when(
                $filters['workflow_status'] ?? null,
                fn (Builder $query, string $status) => $this->applyWorkflowStatus($query, $status),
            )
            ->when(
                $filters['reviewer'] ?? null,
                fn (Builder $query, string $reviewerUuid) => $query->whereHas(
                    'fieldValidationAssignment.assignee',
                    fn (Builder $assignee) => $assignee->where('uuid', $reviewerUuid),
                ),
            )
            ->when(
                $filters['location'] ?? null,
                function (Builder $query, string $location): Builder {
                    if ($location === 'located') {
                        return $query
                            ->whereNotNull('final_latitude')
                            ->whereBetween('final_latitude', [-90, 90])
                            ->whereNotNull('final_longitude')
                            ->whereBetween('final_longitude', [-180, 180]);
                    }

                    return $query->where(function (Builder $query): void {
                        $query
                            ->whereNull('final_latitude')
                            ->orWhereNull('final_longitude')
                            ->orWhereNotBetween('final_latitude', [-90, 90])
                            ->orWhereNotBetween('final_longitude', [-180, 180]);
                    });
                },
            )
            ->when(
                $filters['predicted_label'] ?? null,
                fn (Builder $query, string $label) => $query
                    ->where('predicted_label', $label),
            )
            ->when(
                $filters['barangay'] ?? null,
                fn (Builder $query, string $barangay) => $query
                    ->where('barangay', $barangay),
            )
            ->when(
                $filters['date_from'] ?? null,
                fn (Builder $query, string $date) => $query->where(
                    $dateColumn,
                    '>=',
                    $this->dateBoundary($date),
                ),
            )
            ->when(
                $filters['date_to'] ?? null,
                fn (Builder $query, string $date) => $query->where(
                    $dateColumn,
                    '<',
                    $this->dateBoundary($date)->addDay(),
                ),
            );
    }

    private function dateBoundary(string $date): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $date, self::TIMEZONE)
            ->startOfDay()
            ->utc();
    }

    /**
     * Select one reviewer-queue workflow state using the ratified precedence:
     * Resolved > Field Validation > Referred > Follow-Up > Under Review >
     * Needs Review. Each branch excludes every higher-precedence input so a
     * case belongs to exactly one state.
     */
    private function applyWorkflowStatus(Builder $query, string $status): void
    {
        $activeValidation = [
            Report::FIELD_VALIDATION_STATE_ASSIGNED,
            Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
        ];

        if ($status === Report::WORKFLOW_STATUS_RESOLVED) {
            $query->where('case_state', Report::CASE_STATE_CLOSED);

            return;
        }

        $this->excludeResolved($query);

        if ($status === Report::WORKFLOW_STATUS_FIELD_VALIDATION) {
            $query->whereIn('field_validation_state', $activeValidation);

            return;
        }

        $this->excludeActiveFieldValidation($query, $activeValidation);

        if ($status === Report::WORKFLOW_STATUS_REFERRED) {
            $query->whereIn('referral_state', [
                Report::REFERRAL_STATE_REFERRED,
                Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED,
            ]);

            return;
        }

        $this->excludeReferred($query);

        if ($status === Report::WORKFLOW_STATUS_FOLLOW_UP) {
            $query->where('scheduled_revisit', true);

            return;
        }

        $this->excludeScheduledRevisit($query);

        if ($status === Report::WORKFLOW_STATUS_UNDER_REVIEW) {
            $query->whereNotNull('first_reviewed_at');

            return;
        }

        $query->whereNull('first_reviewed_at');
    }

    private function excludeResolved(Builder $query): void
    {
        $query->where(function (Builder $query): void {
            $query
                ->whereNull('case_state')
                ->orWhere('case_state', '!=', Report::CASE_STATE_CLOSED);
        });
    }

    /**
     * @param  array<int, string>  $activeValidation
     */
    private function excludeActiveFieldValidation(Builder $query, array $activeValidation): void
    {
        $query->where(function (Builder $query) use ($activeValidation): void {
            $query
                ->whereNull('field_validation_state')
                ->orWhereNotIn('field_validation_state', $activeValidation);
        });
    }

    private function excludeReferred(Builder $query): void
    {
        $query->where(function (Builder $query): void {
            $query
                ->whereNull('referral_state')
                ->orWhereNotIn('referral_state', [
                    Report::REFERRAL_STATE_REFERRED,
                    Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED,
                ]);
        });
    }

    private function excludeScheduledRevisit(Builder $query): void
    {
        $query->where(function (Builder $query): void {
            $query
                ->whereNull('scheduled_revisit')
                ->orWhere('scheduled_revisit', false);
        });
    }

    private function escapeLike(string $value): string
    {
        return str_replace(
            ['!', '%', '_'],
            ['!!', '!%', '!_'],
            $value,
        );
    }
}
