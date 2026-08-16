<?php

namespace App\Actions\Reports;

use Illuminate\Database\Eloquent\Builder;
use InvalidArgumentException;

class ApplyReportFilters
{
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
                fn (Builder $query, string $date) => $query
                    ->whereDate($dateColumn, '>=', $date),
            )
            ->when(
                $filters['date_to'] ?? null,
                fn (Builder $query, string $date) => $query
                    ->whereDate($dateColumn, '<=', $date),
            );
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
