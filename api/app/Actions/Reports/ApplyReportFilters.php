<?php

namespace App\Actions\Reports;

use App\Models\Report;
use App\Models\ReportReferral;
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
                ($filters['referral'] ?? null) === 'active',
                fn (Builder $query) => $query->whereHas(
                    'referrals',
                    fn (Builder $referrals) => $referrals->whereIn(
                        'consult_status',
                        ReportReferral::activeStatuses(),
                    ),
                ),
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

    private function escapeLike(string $value): string
    {
        return str_replace(
            ['!', '%', '_'],
            ['!!', '!%', '!_'],
            $value,
        );
    }
}
