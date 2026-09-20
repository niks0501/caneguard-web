<?php

namespace App\Support;

use App\Models\FieldValidationAssignment;
use Illuminate\Support\Collection;

final class MobilePreviousVisit
{
    public static function resolve(FieldValidationAssignment $assignment): ?FieldValidationAssignment
    {
        $assignment->loadMissing(['report', 'completion']);
        $report = $assignment->report;
        $farmReference = self::normalize($report->farmer_or_farm_owner_name);
        $barangay = self::normalize($report->barangay);
        $currentVisitedAt = $assignment->completion?->visited_at;

        /** @var Collection<int, FieldValidationAssignment> $candidates */
        $candidates = FieldValidationAssignment::query()
            ->whereKeyNot($assignment->getKey())
            ->whereHas('completion')
            ->with(['report', 'completion'])
            ->get()
            ->filter(function (FieldValidationAssignment $candidate) use (
                $barangay,
                $farmReference,
                $currentVisitedAt,
            ): bool {
                $candidateReport = $candidate->report;
                if (self::normalize($candidateReport->barangay) !== $barangay) {
                    return false;
                }

                // A missing farm reference deliberately falls back to the
                // barangay. A recorded reference must match exactly after
                // the same whitespace/case normalization on both reports.
                if ($farmReference !== ''
                    && self::normalize($candidateReport->farmer_or_farm_owner_name) !== $farmReference) {
                    return false;
                }

                $candidateVisitedAt = $candidate->completion?->visited_at;
                if ($candidateVisitedAt === null) {
                    return false;
                }

                return $currentVisitedAt === null || $candidateVisitedAt->lt($currentVisitedAt);
            })
            ->sort(function (FieldValidationAssignment $left, FieldValidationAssignment $right): int {
                $leftCompletion = $left->completion;
                $rightCompletion = $right->completion;

                $visitedComparison = $rightCompletion->visited_at <=> $leftCompletion->visited_at;
                if ($visitedComparison !== 0) {
                    return $visitedComparison;
                }

                $createdComparison = $rightCompletion->created_at <=> $leftCompletion->created_at;
                if ($createdComparison !== 0) {
                    return $createdComparison;
                }

                return $rightCompletion->getKey() <=> $leftCompletion->getKey();
            })
            ->values();

        return $candidates->first();
    }

    private static function normalize(?string $value): string
    {
        return preg_replace('/\s+/', ' ', strtolower(trim($value ?? ''))) ?? '';
    }
}
