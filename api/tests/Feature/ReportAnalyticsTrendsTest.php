<?php

namespace Tests\Feature;

use App\Actions\Reports\BuildConditionBarangayTrends;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportAnalyticsTrendsTest extends TestCase
{
    use RefreshDatabase;

    private function seedReport(string $when, ?string $staff, string $predicted, string $barangay): void
    {
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'submitted_at' => CarbonImmutable::parse($when),
            'authority_classified_condition' => $staff,
            'predicted_label' => $predicted,
            'barangay' => $barangay,
        ]);
    }

    /** @return array<string, mixed> */
    private function analytics(string $granularity, string $from, string $to): array
    {
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());

        return $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => $from, 'to' => $to, 'granularity' => $granularity,
        ]))->assertOk()->json('data');
    }

    /** @param  array<string, mixed>  $group */
    private function summedSeries(array $group): array
    {
        $sum = [];
        foreach ([...$group['conditions'], $group['unclassified']] as $condition) {
            foreach ($condition['series'] as $point) {
                $sum[$point['label']] = ($sum[$point['label']] ?? 0) + $point['count'];
            }
        }

        return $sum;
    }

    public function test_condition_series_sum_to_the_total_series_in_every_bucket(): void
    {
        // Sunday 6 Sep 23:00 PHT is Monday-anchored week 31 Aug; 7 Sep 00:30 PHT starts the next week.
        $this->seedReport('2026-09-06T15:00:00Z', 'rust', 'rust', 'Aga');
        $this->seedReport('2026-09-06T16:30:00Z', 'smut', 'mosaic', 'Aga');
        $this->seedReport('2026-09-08T02:00:00Z', null, 'healthy', 'Bucana');
        $this->seedReport('2026-09-09T02:00:00Z', 'downy_mildew', 'rust', 'Bucana');
        $this->seedReport('2026-09-10T02:00:00Z', 'rust', 'rust', 'Bucana');

        foreach (['week', 'day'] as $granularity) {
            $data = $this->analytics($granularity, '2026-08-31', '2026-09-13');
            $totals = array_column($data['series'], 'count', 'label');

            foreach (['staff_classification', 'possible_condition'] as $vocabulary) {
                $this->assertSame(
                    $totals,
                    $this->summedSeries($data['series_by_condition'][$vocabulary]),
                    "$granularity/$vocabulary must reconcile with the total series",
                );
            }
        }

        $data = $this->analytics('week', '2026-08-31', '2026-09-13');
        $staff = collect($data['series_by_condition']['staff_classification']['conditions'])->keyBy('condition');
        $this->assertSame(2, $staff['rust']['total']);
        $this->assertSame(1, $staff['smut']['total']);
        // Null staff classification and the retired downy_mildew value stay visible, not dropped.
        $this->assertSame(2, $data['series_by_condition']['staff_classification']['unclassified']['total']);
        $this->assertSame($data['total_submitted'], array_sum(array_column($data['series'], 'count')));
    }

    public function test_rising_follows_the_double_and_three_case_rule(): void
    {
        // Previous window 18–24 Aug: rust 1, smut 2, mosaic 0. Current 25–31 Aug.
        $this->seedReport('2026-08-20T02:00:00Z', 'rust', 'rust', 'Aga');
        $this->seedReport('2026-08-21T02:00:00Z', 'smut', 'rust', 'Aga');
        $this->seedReport('2026-08-22T02:00:00Z', 'smut', 'rust', 'Aga');
        foreach ([26, 27, 28] as $day) {
            $this->seedReport("2026-08-{$day}T02:00:00Z", 'rust', 'rust', 'Bucana'); // 3 vs 1: rising
        }
        foreach ([26, 27, 28, 29] as $day) {
            $this->seedReport("2026-08-{$day}T03:00:00Z", 'smut', 'mosaic', 'Bucana'); // 4 vs 2: rising
        }
        $this->seedReport('2026-08-30T02:00:00Z', 'mosaic', 'mosaic', 'Bucana');
        $this->seedReport('2026-08-30T03:00:00Z', 'mosaic', 'mosaic', 'Bucana'); // 2 vs 0: below 3 cases

        $data = $this->analytics('day', '2026-08-25', '2026-08-31');
        $this->assertSame(['ratio' => 2, 'min_cases' => 3], $data['rising_rule']);

        $staff = collect($data['series_by_condition']['staff_classification']['conditions'])->keyBy('condition');
        $this->assertTrue($staff['rust']['rising']);
        $this->assertTrue($staff['smut']['rising']);
        $this->assertFalse($staff['mosaic']['rising']);
        $this->assertSame(1, $staff['rust']['previous_total']);

        $this->assertTrue(BuildConditionBarangayTrends::isRising(3, 1));
        $this->assertTrue(BuildConditionBarangayTrends::isRising(3, 0));
        $this->assertFalse(BuildConditionBarangayTrends::isRising(2, 0));
        $this->assertFalse(BuildConditionBarangayTrends::isRising(5, 3));
        $this->assertTrue(BuildConditionBarangayTrends::isRising(6, 3));
    }

    public function test_top_barangays_rank_by_this_period_with_previous_deltas(): void
    {
        $this->seedReport('2026-08-20T02:00:00Z', 'rust', 'rust', 'Aga');
        $this->seedReport('2026-08-21T02:00:00Z', 'rust', 'rust', 'Aga');
        foreach ([26, 27, 28] as $day) {
            $this->seedReport("2026-08-{$day}T02:00:00Z", 'rust', 'rust', 'Bucana');
        }
        $this->seedReport('2026-08-26T03:00:00Z', 'rust', 'rust', 'Aga');
        foreach (['Banilad', 'Bilaran', 'Bulihan', 'Butucan'] as $name) {
            $this->seedReport('2026-08-29T02:00:00Z', 'rust', 'rust', $name);
        }
        $this->seedReport('2026-08-29T03:00:00Z', 'rust', 'rust', 'Calayo'); // sixth place: cut

        $rows = $this->analytics('day', '2026-08-25', '2026-08-31')['series_by_barangay'];

        $this->assertSame(5, $rows['top_n']);
        $this->assertCount(5, $rows['rows']);
        $this->assertSame(
            ['barangay' => 'Bucana', 'total' => 3, 'previous_total' => 0, 'delta' => 3, 'rising' => true],
            $rows['rows'][0],
        );
        $this->assertSame(
            ['barangay' => 'Aga', 'total' => 1, 'previous_total' => 2, 'delta' => -1, 'rising' => false],
            $rows['rows'][1],
        );
    }
}
