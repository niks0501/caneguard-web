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
                $query->where(function (Builder $query) use ($search) {
                    $query
                        ->where('reference_code', 'like', "%{$search}%")
                        ->orWhere('barangay', 'like', "%{$search}%")
                        ->orWhereHas('reporter', fn (Builder $reporter) => $reporter
                            ->where('name', 'like', "%{$search}%"));
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
}
