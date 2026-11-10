<?php

namespace App\Support;

use App\Models\FieldValidationAssignment;
use Illuminate\Support\Collection;

final class MobilePreviousVisit
{
    private const CANDIDATES_ATTRIBUTE = 'mobile_previous_visit_candidates';

    /**
     * The `previous_visit` object the mobile assignment feed delivers, or null
     * when no earlier visit resolves. The feed version digests this payload,
     * so the serializer and the digest share one definition.
     *
     * @return array<string, mixed>|null
     */
    public static function payload(FieldValidationAssignment $assignment): ?array
    {
        $previous = self::resolve($assignment);
        if ($previous === null) {
            return null;
        }

        $completion = $previous->completion;

        return [
            'reference_code' => $previous->report->reference_code,
            'visited_at' => $completion->visited_at->utc()->toISOString(),
            'reporter_suspected_condition' => $previous->report->reporter_suspected_condition,
            'authority_classified_condition' => $previous->report->authority_classified_condition,
            'action_taken' => $completion->action_taken,
            'field_observation' => $completion->field_observation,
            'field_finding' => $completion->field_finding,
            'follow_up_outcome' => $completion->follow_up_outcome,
            'fresh_photo_available' => $completion->fresh_photo_path !== null,
        ];
    }

    public static function resolve(FieldValidationAssignment $assignment): ?FieldValidationAssignment
    {
        $assignment->loadMissing(['report', 'completion']);
        $report = $assignment->report;
        $farmReference = self::normalize($report->farmer_or_farm_owner_name);
        $barangay = self::normalize($report->barangay);
        $currentVisitedAt = $assignment->completion?->visited_at;

        $candidates = self::candidates($report->district_id, $assignment->assignee_id)
            ->reject(fn (FieldValidationAssignment $candidate): bool => (string) $candidate->getKey() === (string) $assignment->getKey())
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

    /**
     * Earlier visits of the same owner in the same district, loaded once per
     * request so every row of one feed page reuses the same candidate set.
     *
     * @return Collection<int, FieldValidationAssignment>
     */
    private static function candidates(int|string|null $districtId, int|string|null $assigneeId): Collection
    {
        $request = request();
        $key = self::CANDIDATES_ATTRIBUTE.'|'.$districtId.'|'.$assigneeId;
        $cached = $request->attributes->get($key);
        if ($cached instanceof Collection) {
            return $cached;
        }

        // Previous-visit context is part of the owner-scoped assignment feed;
        // never match a completion assigned to another reporter.
        $candidates = FieldValidationAssignment::query()
            ->where('assignee_id', $assigneeId)
            ->whereHas('completion')
            ->whereHas('report', fn ($query) => $query->where('district_id', $districtId))
            ->with(['report', 'completion'])
            ->get();

        $request->attributes->set($key, $candidates);

        return $candidates;
    }

    private static function normalize(?string $value): string
    {
        return preg_replace('/\s+/', ' ', strtolower(trim($value ?? ''))) ?? '';
    }
}
