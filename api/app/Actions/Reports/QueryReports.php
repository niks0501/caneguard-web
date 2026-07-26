<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class QueryReports
{
    /**
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator<int, Report>
     */
    public function handle(array $filters): LengthAwarePaginator
    {
        $query = Report::query()->with(['reporter', 'reviewer']);

        $query
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
                    ->whereDate('submitted_at', '>=', $date),
            )
            ->when(
                $filters['date_to'] ?? null,
                fn (Builder $query, string $date) => $query
                    ->whereDate('submitted_at', '<=', $date),
            );

        [$column, $direction] = match ($filters['sort'] ?? '-submitted_at') {
            'submitted_at' => ['submitted_at', 'asc'],
            '-confidence' => ['confidence', 'desc'],
            'confidence' => ['confidence', 'asc'],
            default => ['submitted_at', 'desc'],
        };

        return $query
            ->orderBy($column, $direction)
            ->orderBy('id')
            ->paginate((int) ($filters['per_page'] ?? 15))
            ->withQueryString();
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
