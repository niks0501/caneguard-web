<?php

namespace App\Actions\Reports;

use App\Models\District;
use App\Models\Report;
use App\Models\User;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * The weekly RSSI export that office staff email to the SRA by hand.
 *
 * Two rules define it. A case is validated only when office staff classified it
 * as RSSI and its verification outcome is verified, which is the same
 * confirmation rule the official weekly report uses. Everything else that
 * signals RSSI stays a suspected case in its own section, so a suspected count
 * can never inflate a validated total.
 *
 * Farmer and farm names never enter this dataset, and no infestation percentage
 * is produced: CaneGuard has no confirmed calculation method for one.
 */
final class BuildWeeklyRssiReport
{
    public const CONTRACT = 'weekly-rssi-report-v1';

    public const SECTION_VALIDATED = 'validated';

    public const SECTION_SUSPECTED = 'suspected';

    public function __construct(
        private readonly BuildReportDocument $periods,
        private readonly DistrictAccess $districtAccess,
    ) {}

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function handle(array $input, ?User $actor = null): array
    {
        $actor ??= request()->user();
        $period = $this->periods->resolvePeriod($input);

        $validated = [];
        $suspected = [];
        foreach ($this->query($actor, $period['start'], $period['end'])->get() as $report) {
            if ($this->isValidated($report)) {
                $validated[] = $this->row($report) + ['section' => self::SECTION_VALIDATED];

                continue;
            }

            $suspected[] = $this->row($report) + ['section' => self::SECTION_SUSPECTED];
        }

        return [
            'contract' => self::CONTRACT,
            'district' => $this->district(),
            'period' => [
                'type' => $period['type'],
                'from' => $period['start']->toDateString(),
                'to' => $period['end']->subDay()->toDateString(),
                'label' => $period['label'],
                'timezone' => BuildReportDocument::TIMEZONE,
                'partial' => $period['partial'],
            ],
            'generated_at' => now(BuildReportDocument::TIMEZONE)->format('j F Y g:i A').' PHT',
            'generated_by' => $actor?->name ?? 'CaneGuard office',
            'sections' => [
                self::SECTION_VALIDATED => [
                    'label' => 'Reviewed and validated RSSI cases',
                    'cases' => count($validated),
                    'barangays' => $this->barangayCount($validated),
                    'reported_area_hectares' => $this->reportedArea($validated),
                    'area_method' => 'Sum of reported measured areas; fields may overlap, so this is not a unique infested area. Unmeasured cases carry no area.',
                    'rows' => $validated,
                ],
                self::SECTION_SUSPECTED => [
                    'label' => 'Suspected RSSI cases',
                    'cases' => count($suspected),
                    'barangays' => $this->barangayCount($suspected),
                    'excluded_from_validated_totals' => true,
                    'rows' => $suspected,
                ],
            ],
            'barangays' => $this->barangayBreakdown($validated, $suspected),
            'method' => [
                'confirmation' => 'A case is validated only when office staff classified it as RSSI and its verification outcome is verified. Suspected cases are listed separately and are never added to validated totals.',
                'boundary' => 'Cases received inside the selected Asia/Manila period, on their receipt date. Duplicate-linked reports and records staff classified as another condition are excluded.',
                'privacy' => 'No farmer or farm names are included in this export.',
            ],
            'omitted_metrics' => [
                [
                    'key' => 'infestation_percentage',
                    'label' => 'Infestation percentage',
                    'reason' => 'Not reported: CaneGuard has no confirmed calculation method for it.',
                ],
            ],
        ];
    }

    private function query(?User $actor, CarbonImmutable $start, CarbonImmutable $end): Builder
    {
        return Report::query()->visibleTo($actor)
            ->whereNull('canonical_report_id')
            ->where('submitted_at', '>=', $start->utc())
            ->where('submitted_at', '<', $end->utc())
            // A staff RSSI classification wins; an unclassified report still
            // counts as suspected when the reporter raised RSSI themselves.
            ->where(function (Builder $query): void {
                $query->where('authority_classified_condition', Report::AUTHORITY_CONDITION_RSSI)
                    ->orWhere(fn (Builder $inner) => $inner->whereNull('authority_classified_condition')
                        ->where('reporter_suspected_condition', Report::REPORTER_CONCERN_RSSI));
            })
            ->orderBy('submitted_at')
            ->orderBy('id');
    }

    private function isValidated(Report $report): bool
    {
        return $report->authority_classified_condition === Report::AUTHORITY_CONDITION_RSSI
            && $report->verification_outcome === Report::VERIFICATION_OUTCOME_VERIFIED;
    }

    /**
     * @return array<string, mixed>
     */
    private function row(Report $report): array
    {
        $measured = $report->affectedAreaMeasurement() === Report::MEASUREMENT_MEASURED
            && $report->affected_area_hectares !== null;

        return [
            'case_reference' => (string) $report->reference_code,
            'submitted_date' => $report->submitted_at?->timezone(BuildReportDocument::TIMEZONE)->toDateString() ?? '',
            'barangay' => trim((string) $report->barangay) ?: 'Not recorded',
            'staff_classification' => $report->authority_classified_condition === Report::AUTHORITY_CONDITION_RSSI
                ? 'RSSI'
                : 'Not classified',
            'verification_outcome' => $this->verificationLabel($report->verification_outcome),
            'area_hectares' => $measured ? round((float) $report->affected_area_hectares, 2) : null,
            'area_measurement' => $measured ? 'Measured' : 'Not measured',
        ];
    }

    private function verificationLabel(?string $outcome): string
    {
        return match ($outcome) {
            Report::VERIFICATION_OUTCOME_VERIFIED => 'Verified',
            Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY => 'Unable to verify',
            default => 'Not determined',
        };
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function barangayCount(array $rows): int
    {
        return count(array_unique(array_map(
            static fn (array $row): string => mb_strtolower((string) $row['barangay']),
            $rows,
        )));
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function reportedArea(array $rows): float
    {
        return round(array_sum(array_map(
            static fn (array $row): float => (float) ($row['area_hectares'] ?? 0),
            $rows,
        )), 2);
    }

    /**
     * @param  array<int, array<string, mixed>>  $validated
     * @param  array<int, array<string, mixed>>  $suspected
     * @return array<int, array{barangay:string,validated:int,suspected:int}>
     */
    private function barangayBreakdown(array $validated, array $suspected): array
    {
        $barangays = [];
        foreach ([[self::SECTION_VALIDATED, $validated], [self::SECTION_SUSPECTED, $suspected]] as [$section, $rows]) {
            foreach ($rows as $row) {
                $key = mb_strtolower((string) $row['barangay']);
                $barangays[$key] ??= ['barangay' => (string) $row['barangay'], self::SECTION_VALIDATED => 0, self::SECTION_SUSPECTED => 0];
                $barangays[$key][$section]++;
            }
        }
        ksort($barangays);

        return array_values($barangays);
    }

    /**
     * @return array{code:string,name:string}|null
     */
    private function district(): ?array
    {
        $id = $this->districtAccess->pilotId();
        $district = $id === null ? null : District::query()->find($id);

        return $district === null ? null : ['code' => (string) $district->code, 'name' => (string) $district->name];
    }
}
