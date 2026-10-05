<?php

namespace App\Actions\Reports;

use App\Models\District;
use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

/** The only aggregation source for official weekly versions; previews are separate. */
final class BuildWeeklyReportContent
{
    public const DISEASES = ['healthy' => 'Healthy', 'rssi' => 'RSSI', 'mosaic' => 'Sugarcane Mosaic', 'rust' => 'Sugarcane Rust', 'smut' => 'Sugarcane Smut'];

    public function period(string $week): array
    {
        if (! preg_match('/^(\d{4})-W(\d{2})$/', $week, $parts)) {
            throw ValidationException::withMessages(['week' => 'Use a valid ISO week (YYYY-Www).']);
        }
        $start = CarbonImmutable::now('Asia/Manila')->setISODate((int) $parts[1], (int) $parts[2], 1)->startOfDay();
        if ($start->format('o-\WW') !== $week) {
            throw ValidationException::withMessages(['week' => 'The selected ISO week does not exist.']);
        }

        return ['start' => $start, 'end' => $start->addWeek()];
    }

    public function query(int $districtId, CarbonImmutable $start): Builder
    {
        return Report::query()->where('district_id', $districtId)
            ->where('submitted_at', '>=', $start->utc())->where('submitted_at', '<', $start->addWeek()->utc());
    }

    public function lateQuery(int $districtId, CarbonImmutable $start): Builder
    {
        return Report::query()->where('district_id', $districtId)->where('submitted_at', '>=', $start->addWeek()->utc())
            ->where(function ($query) use ($start): void {
                $query->where(fn ($q) => $q->where('observed_at', '>=', $start->utc())->where('observed_at', '<', $start->addWeek()->utc()))
                    ->orWhere(fn ($q) => $q->whereNull('observed_at')->where('captured_at', '>=', $start->utc())->where('captured_at', '<', $start->addWeek()->utc()));
            });
    }

    public function handle(District $district, string $week, bool $appendix = false): array
    {
        $period = $this->period($week);
        $query = $this->query($district->id, $period['start']);
        $rows = (clone $query)->orderBy('id')->get();
        $cases = $rows->whereNull('canonical_report_id');
        $diseases = [];
        $area = [];
        foreach (self::DISEASES as $key => $label) {
            $diseases[$key] = ['key' => $key, 'label' => $label, 'suspected' => 0, 'under_review' => 0, 'confirmed' => 0];
            $area[$key] = ['key' => $key, 'overlap_controlled_estimate' => 0, 'sum_of_reported_areas_may_overlap' => 0, 'unique_geometric' => null];
        }
        $unclassified = ['mixed_or_multiple' => 0, 'unable_to_classify' => 0, 'none' => 0];
        $status = ['open' => 0, 'closed' => 0];
        $barangays = $farmers = $groups = $actions = $late = $points = $appendixRows = [];
        $namedReports = $excluded = $unlocated = 0;
        foreach ($cases as $report) {
            // Historical Downy mildew is outside this document, including fallback AI labels.
            if ($report->authority_classified_condition === 'downy_mildew' || $report->predicted_label === 'downy_mildew') {
                $excluded++;

                continue;
            }
            [$disease, $state] = $this->classify($report);
            $barangay = trim((string) $report->barangay) ?: 'Not recorded';
            $bkey = $this->normalize($barangay);
            $barangays[$bkey] ??= ['barangay' => $barangay, 'cases' => 0, 'confirmed_by_disease' => array_fill_keys(array_keys(self::DISEASES), 0), 'hectares_by_disease' => []];
            $barangays[$bkey]['cases']++;
            if ($disease !== null) {
                $diseases[$disease][$state]++;
                if ($state === 'confirmed') {
                    $barangays[$bkey]['confirmed_by_disease'][$disease]++;
                }
            } else {
                $unclassified[$state]++;
            }
            $status[$report->case_state === 'closed' ? 'closed' : 'open']++;
            $name = $this->normalize((string) $report->farmer_or_farm_owner_name);
            if ($name !== '') {
                $farmers[json_encode([$bkey, $name], JSON_THROW_ON_ERROR)] = true;
                $namedReports++;
            }
            if ($disease !== null && $report->affected_area_hectares !== null) {
                $cents = max(0, (int) round((float) $report->affected_area_hectares * 100));
                $area[$disease]['sum_of_reported_areas_may_overlap'] += $cents;
                $barangays[$bkey]['hectares_by_disease'][$disease] ??= ['estimate' => 0, 'sum_may_overlap' => 0];
                $barangays[$bkey]['hectares_by_disease'][$disease]['sum_may_overlap'] += $cents;
                // An unnamed farm cannot establish an overlap-controlled group. Do not invent one.
                if ($name !== '' && $report->affectedAreaMeasurement() === 'measured') {
                    $gkey = json_encode([$bkey, $name, $disease], JSON_THROW_ON_ERROR);
                    $groups[$gkey] = ['barangay' => $bkey, 'disease' => $disease, 'max' => max($groups[$gkey]['max'] ?? 0, $cents)];
                }
            }
            if (in_array($report->action_taken, ['advisory_provided', 'technical_assistance_provided', 'no_further_action_required'], true)) {
                $actions[$report->action_taken] = ($actions[$report->action_taken] ?? 0) + 1;
            }
            $observed = $report->observed_at ?? $report->captured_at;
            if ($observed && $observed->lessThan($period['start']->utc())) {
                $prior = $observed->timezone('Asia/Manila')->format('o-\WW');
                $late[$prior] = ($late[$prior] ?? 0) + 1;
            }
            if ($report->final_latitude !== null && $report->final_longitude !== null) {
                // Coarse map clusters, never exact farm coordinates or identities in the body.
                $pkey = sprintf('%.2f,%.2f', $report->final_longitude, $report->final_latitude);
                $points[$pkey] ??= ['longitude' => round((float) $report->final_longitude, 2), 'latitude' => round((float) $report->final_latitude, 2), 'cases' => 0];
                $points[$pkey]['cases']++;
            } else {
                $unlocated++;
            }
            if ($appendix) {
                $appendixRows[] = ['reference' => $report->reference_code, 'barangay' => $barangay, 'farmer_or_farm_reference' => $report->farmer_or_farm_owner_name, 'disease' => $disease, 'status' => $state];
            }
        }
        foreach ($groups as $group) {
            $area[$group['disease']]['overlap_controlled_estimate'] += $group['max'];
            $barangays[$group['barangay']]['hectares_by_disease'][$group['disease']]['estimate'] += $group['max'];
        }
        foreach ($area as &$item) {
            $item['overlap_controlled_estimate'] /= 100;
            $item['sum_of_reported_areas_may_overlap'] /= 100;
        }
        unset($item);
        foreach ($barangays as &$barangay) {
            ksort($barangay['hectares_by_disease']);
            foreach ($barangay['hectares_by_disease'] as &$hectares) {
                $hectares['estimate'] /= 100;
                $hectares['sum_may_overlap'] /= 100;
            }
            unset($hectares);
        }
        unset($barangay);
        ksort($barangays);
        ksort($actions);
        ksort($late);
        ksort($points);

        return [
            'contract' => 'weekly-report-content-v1',
            'district' => ['code' => $district->code, 'name' => $district->name],
            'period' => ['type' => 'weekly', 'week' => $week, 'from' => $period['start']->toDateString(), 'to' => $period['end']->subDay()->toDateString(), 'timezone' => 'Asia/Manila', 'boundary_basis' => 'submitted_at'],
            'case_universe' => ['cases' => $cases->count() - $excluded, 'source_reports' => $rows->count(), 'duplicate_linked_excluded' => $rows->count() - $cases->count(), 'out_of_scope_excluded' => $excluded],
            'diseases' => array_values($diseases), 'unclassified' => $unclassified, 'status' => $status,
            'barangays' => array_values($barangays),
            'farmers' => ['named_unique' => count($farmers), 'reports_carrying_farmer_information' => $namedReports, 'method' => 'name_matched_approximate'],
            'hectares' => ['by_disease' => array_values($area), 'method_statement' => 'Estimated reported area: maximum measured area per barangay, named farm and disease group; not a survey measurement. Unnamed farms are excluded from the estimate. The secondary sum may overlap. Unique geometric hectares are unavailable until surveys are linked. Do not total across diseases.'],
            'actions' => collect($actions)->map(fn ($count, $key) => ['key' => $key, 'count' => $count])->values()->all(),
            'late_evidence' => ['received_later_for_this_week' => $this->inScopeCases($this->lateQuery($district->id, $period['start']))->count(), 'reports_synced_after_period' => array_sum($late), 'affected_prior_weeks' => collect($late)->map(fn ($count, $week) => ['week' => $week, 'count' => $count])->values()->all()],
            'trend' => $this->trend($query, $period['start']),
            'map' => ['asset_digest' => app(WeeklyReportGraphics::class)->assetDigest(), 'clusters' => array_values($points), 'unlocated_cases' => $unlocated, 'precision' => '0.01 degree clusters; not farm boundaries'],
            'method' => ['classification' => 'Staff classification takes precedence. Confirmation requires staff classification and verified outcome; AI alone never confirms.', 'deduplication' => 'Duplicate-linked reports are excluded from case counts and retained as source evidence.', 'area' => 'Farm-group maximum; per disease only.', 'boundary' => 'Receipt week: Monday 12:00 AM through Sunday 11:59 PM, Asia/Manila. Late evidence does not move cases into an earlier week.'],
            'appendix_enabled' => $appendix, 'appendix' => $appendixRows,
        ];
    }

    private function classify(Report $report): array
    {
        $staff = $report->authority_classified_condition;
        if (in_array($staff, ['mixed_or_multiple', 'unable_to_classify'], true)) {
            return [null, $staff];
        }
        $disease = isset(self::DISEASES[$staff ?? '']) ? $staff
            : (in_array($report->predicted_label, ['healthy', 'mosaic', 'rust', 'smut'], true) ? $report->predicted_label
                : ($report->reporter_suspected_condition === 'RSSI' ? 'rssi' : null));
        if ($disease === null) {
            return [null, 'none'];
        }
        if ($staff === $disease && $report->verification_outcome === 'verified') {
            return [$disease, 'confirmed'];
        }
        $review = in_array($report->field_validation_state, ['assigned', 'in_progress'], true)
            || ($report->case_state === 'open' && ($report->reviewer_id !== null || $staff !== null || $report->action_taken !== null));

        return [$disease, $review ? 'under_review' : 'suspected'];
    }

    private function normalize(string $value): string
    {
        return mb_strtolower(preg_replace('/\s+/u', ' ', trim($value)) ?? '', 'UTF-8');
    }

    private function inScopeCases(Builder $query): Builder
    {
        return (clone $query)->whereNull('canonical_report_id')
            ->where(fn ($q) => $q->whereNull('authority_classified_condition')->orWhere('authority_classified_condition', '!=', 'downy_mildew'))
            ->where(fn ($q) => $q->whereNull('predicted_label')->orWhere('predicted_label', '!=', 'downy_mildew'));
    }

    private function trend(Builder $query, CarbonImmutable $start): array
    {
        $query = $this->inScopeCases($query);
        $date = $query->getConnection()->getDriverName() === 'sqlite' ? "date(submitted_at, '+8 hours')" : 'DATE(DATE_ADD(submitted_at, INTERVAL 8 HOUR))';
        $counts = $query->selectRaw("$date AS day, COUNT(*) AS total")->groupByRaw($date)->pluck('total', 'day');
        $days = [];
        for ($i = 0; $i < 7; $i++) {
            $day = $start->addDays($i)->toDateString();
            $days[] = ['date' => $day, 'count' => (int) ($counts[$day] ?? 0)];
        }

        return $days;
    }
}
