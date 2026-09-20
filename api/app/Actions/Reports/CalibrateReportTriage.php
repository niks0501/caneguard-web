<?php

namespace App\Actions\Reports;

use App\Models\Report;

/**
 * Calibrate attention-band edges from cases that already have a human review.
 *
 * The starting green edge is the captain's example (0.85 confidence), but it
 * is not a shipped threshold: any reviewed green candidate that disagreed
 * with the human verdict raises the edge until no green candidate misfires.
 */
final class CalibrateReportTriage
{
    private const STARTING_GREEN_CONFIDENCE = 0.85;

    private const THRESHOLD_STEP = 0.001;

    /**
     * @return array{enabled: bool, green_min_confidence: float|null, reviewed_cases: int, calibration_cases: int, green_misfires: int, measured_at: string, next_measurement_due_at: string, note: string}
     */
    public function handle(): array
    {
        $reviewed = Report::query()
            ->whereNotNull('first_reviewed_at')
            ->with('qualityWarnings')
            ->get([
                'id',
                'predicted_label',
                'confidence',
                'checklist_consistency',
                'mismatch_reported',
                'reported_severity',
                'location_source',
                'gps_accuracy',
                'reporter_suspected_condition',
                'authority_classified_condition',
                'verification_outcome',
            ]);
        $calibrationCases = $reviewed->filter(
            fn (Report $report): bool => $this->reviewerVerdict($report) !== null,
        );

        $threshold = self::STARTING_GREEN_CONFIDENCE;
        $misfires = 0;
        while (true) {
            $misfiringCandidates = $calibrationCases->filter(
                fn (Report $report): bool => $this->isGreenCandidate($report, $threshold)
                    && $this->reviewerVerdict($report) === false,
            );
            if ($misfiringCandidates->isEmpty()) {
                break;
            }

            $misfires += $misfiringCandidates->count();
            $threshold = min(
                1.001,
                (float) $misfiringCandidates->max(
                    fn (Report $report): float => (float) $report->confidence,
                ) + self::THRESHOLD_STEP,
            );
        }

        $enabled = $calibrationCases->isNotEmpty();
        $measuredAt = now()->utc();

        return [
            'enabled' => $enabled,
            'green_min_confidence' => $enabled && $threshold <= 1
                ? round($threshold, 3)
                : null,
            'reviewed_cases' => $reviewed->count(),
            'calibration_cases' => $calibrationCases->count(),
            'green_misfires' => $misfires,
            'measured_at' => $measuredAt->toISOString(),
            'next_measurement_due_at' => $measuredAt->addMonth()->toISOString(),
            'note' => 'Re-measure monthly against reviewer verdicts; bands reorder attention but never hide a case or make a decision.',
        ];
    }

    /**
     * @param  array{enabled: bool, green_min_confidence: float|null}  $calibration
     * @return array{band: string|null, reasons: array<int, string>}
     */
    public function classify(Report $report, array $calibration): array
    {
        if (! $calibration['enabled']) {
            return ['band' => null, 'reasons' => []];
        }

        $greenThreshold = $calibration['green_min_confidence'] ?? 1.001;
        $redReasons = $this->redReasons($report);
        if ($redReasons !== []) {
            return ['band' => 'red', 'reasons' => $redReasons];
        }

        if ($this->isGreenCandidate($report, $greenThreshold)) {
            return [
                'band' => 'green',
                'reasons' => ['Reviewed examples show agreement across the submitted evidence.'],
            ];
        }

        return [
            'band' => 'amber',
            'reasons' => $this->amberReasons($report, $greenThreshold),
        ];
    }

    private function isGreenCandidate(Report $report, float $threshold): bool
    {
        return $report->confidence !== null
            && (float) $report->confidence >= $threshold
            && $report->checklist_consistency === 'consistent'
            && $report->mismatch_reported === false
            && $report->qualityWarnings->isEmpty()
            && $report->location_source === Report::LOCATION_SOURCE_GPS
            && $report->gps_accuracy !== null
            && $report->reporter_suspected_condition === null
            && $report->reported_severity !== 'high';
    }

    /**
     * @return array<int, string>
     */
    private function redReasons(Report $report): array
    {
        $reasons = [];
        if ($report->verification_outcome === Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY) {
            $reasons[] = 'Reviewer recorded unable to verify.';
        }
        if ($report->mismatch_reported === true) {
            $reasons[] = 'Reporter flagged a mismatch.';
        }
        if (in_array($report->checklist_consistency, ['inconsistent', 'inconclusive'], true)) {
            $reasons[] = 'Checklist signature does not agree with the possible condition.';
        }
        if ($report->qualityWarnings->isNotEmpty()) {
            $reasons[] = 'Image quality warnings are present.';
        }
        if ($report->reported_severity === 'high') {
            $reasons[] = 'Reporter recorded high severity.';
        }
        if ($report->location_source !== Report::LOCATION_SOURCE_GPS
            || $report->gps_accuracy === null
        ) {
            $reasons[] = 'Location provenance is unavailable or not GPS-backed.';
        }
        if ($report->reporter_suspected_condition !== null) {
            $reasons[] = 'Reporter recorded an additional concern.';
        }

        return $reasons;
    }

    /**
     * @return array<int, string>
     */
    private function amberReasons(Report $report, float $threshold): array
    {
        $reasons = [];
        if ($report->confidence === null || (float) $report->confidence < $threshold) {
            $reasons[] = 'Confidence is below the calibrated green edge.';
        }
        if ($report->checklist_consistency !== 'consistent') {
            $reasons[] = 'Checklist signature needs reviewer judgement.';
        }
        if ($report->mismatch_reported !== false) {
            $reasons[] = 'Reporter agreement is not an explicit match.';
        }
        if ($report->qualityWarnings->isNotEmpty()) {
            $reasons[] = 'Image quality needs a closer look.';
        }
        if ($report->location_source !== Report::LOCATION_SOURCE_GPS
            || $report->gps_accuracy === null
        ) {
            $reasons[] = 'Location provenance needs review.';
        }
        if ($reasons === []) {
            $reasons[] = 'Evidence needs a normal reviewer read.';
        }

        return $reasons;
    }

    private function reviewerVerdict(Report $report): ?bool
    {
        if ($report->authority_classified_condition !== null) {
            return $report->authority_classified_condition === $report->predicted_label;
        }

        return match ($report->verification_outcome) {
            Report::VERIFICATION_OUTCOME_VERIFIED => true,
            Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY => false,
            default => null,
        };
    }
}
