<?php

namespace Tests\Feature;

use App\Actions\Reports\BuildWeeklyReportContent;
use App\Actions\Reports\DistrictReportWorkflow;
use App\Actions\Reports\WeeklyReportGraphics;
use App\Models\District;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WeeklyReportContentTest extends TestCase
{
    use RefreshDatabase;

    public function test_five_classes_staff_only_confirmation_and_unclassified_are_exhaustive(): void
    {
        $district = $this->pilotDistrict();
        $this->report($district, ['predicted_label' => 'smut', 'verification_outcome' => 'verified']);
        $this->report($district, ['authority_classified_condition' => 'smut', 'verification_outcome' => 'verified']);
        $this->report($district, ['authority_classified_condition' => 'healthy', 'verification_outcome' => 'verified']);
        $this->report($district, ['authority_classified_condition' => 'rssi', 'verification_outcome' => 'verified']);
        $this->report($district, ['predicted_label' => 'rust', 'field_validation_state' => 'assigned']);
        $this->report($district, ['predicted_label' => 'mosaic']);
        foreach (['mixed_or_multiple', 'unable_to_classify'] as $condition) {
            $this->report($district, ['authority_classified_condition' => $condition, 'predicted_label' => 'healthy']);
        }
        $this->report($district, ['predicted_label' => 'unknown', 'reporter_suspected_condition' => 'RSSI']);
        $this->report($district, ['predicted_label' => 'unknown']);
        $this->report($district, ['authority_classified_condition' => 'downy_mildew', 'predicted_label' => 'healthy']);
        $content = app(BuildWeeklyReportContent::class)->handle($district, '2026-W40');
        $rows = collect($content['diseases'])->keyBy('key');
        $this->assertSame(array_keys(BuildWeeklyReportContent::DISEASES), $rows->keys()->all());
        $this->assertSame(1, $rows['smut']['suspected']);
        $this->assertSame(1, $rows['smut']['confirmed']);
        $this->assertSame(1, $rows['healthy']['confirmed']);
        $this->assertSame(1, $rows['rssi']['suspected']);
        $this->assertSame(1, $rows['rssi']['confirmed']);
        $this->assertSame(1, $rows['rust']['under_review']);
        $this->assertSame(1, $rows['mosaic']['suspected']);
        $this->assertSame(['mixed_or_multiple' => 1, 'unable_to_classify' => 1, 'none' => 1], $content['unclassified']);
        $this->assertSame(10, $content['case_universe']['cases']);
        $this->assertSame(1, $content['case_universe']['out_of_scope_excluded']);
        $total = $rows->sum(fn ($row) => $row['suspected'] + $row['under_review'] + $row['confirmed']) + array_sum($content['unclassified']);
        $this->assertSame($content['case_universe']['cases'], $total);
        $this->assertSame(10, array_sum(array_column($content['trend'], 'count')));
    }

    public function test_case_duplicates_farm_group_maximum_and_farmer_names_never_become_report_counts(): void
    {
        $district = $this->pilotDistrict();
        $first = $this->report($district, ['farmer_or_farm_owner_name' => 'Farm One', 'affected_area_hectares' => 4]);
        $this->report($district, ['farmer_or_farm_owner_name' => '  FARM   ONE ', 'affected_area_hectares' => 2.5]);
        $this->report($district, ['farmer_or_farm_owner_name' => 'Farm Two', 'predicted_label' => 'mosaic', 'affected_area_hectares' => 3]);
        $this->report($district, ['farmer_or_farm_owner_name' => 'Farm Three', 'predicted_label' => 'rust', 'affected_area_hectares' => 5]);
        $this->report($district, ['farmer_or_farm_owner_name' => 'Farm Four', 'affected_area_hectares' => 1.5]);
        $this->report($district, ['farmer_or_farm_owner_name' => 'Farm Four', 'affected_area_hectares' => null]);
        $this->report($district, ['canonical_report_id' => $first->id, 'affected_area_hectares' => 100]);
        $this->report($district, ['farmer_or_farm_owner_name' => '', 'affected_area_hectares' => null]);
        $content = app(BuildWeeklyReportContent::class)->handle($district, '2026-W40');
        $this->assertSame(7, $content['case_universe']['cases']);
        $this->assertSame(8, $content['case_universe']['source_reports']);
        $this->assertSame(1, $content['case_universe']['duplicate_linked_excluded']);
        $this->assertSame(4, $content['farmers']['named_unique']);
        $this->assertSame(6, $content['farmers']['reports_carrying_farmer_information']);
        $this->assertEquals(13.5, array_sum(array_column($content['hectares']['by_disease'], 'overlap_controlled_estimate')));
        $this->assertEquals(16, array_sum(array_column($content['hectares']['by_disease'], 'sum_of_reported_areas_may_overlap')));
        $this->assertSame([null, null, null, null, null], array_column($content['hectares']['by_disease'], 'unique_geometric'));
        $this->assertSame([], $content['appendix']);
        $this->assertStringNotContainsString('Farm One', json_encode($content));
    }

    public function test_unmeasured_and_unnamed_areas_cannot_inflate_overlap_controlled_estimate(): void
    {
        $district = $this->pilotDistrict();
        $this->report($district, ['affected_area_hectares' => 10, 'affected_area_measurement' => 'not_measured']);
        $this->report($district, ['affected_area_hectares' => 20, 'farmer_or_farm_owner_name' => null]);
        $content = app(BuildWeeklyReportContent::class)->handle($district, '2026-W40');
        $smut = collect($content['hectares']['by_disease'])->keyBy('key')['smut'];
        $this->assertEquals(0, $smut['overlap_controlled_estimate']);
        $this->assertEquals(30, $smut['sum_of_reported_areas_may_overlap']);
    }

    public function test_manila_iso_week_is_half_open_and_late_receipts_stay_in_receipt_week(): void
    {
        $district = $this->pilotDistrict();
        foreach (['2026-09-27 15:59:59', '2026-09-27 16:00:00', '2026-10-04 15:59:59', '2026-10-04 16:00:00'] as $submitted) {
            $this->report($district, ['submitted_at' => $submitted, 'observed_at' => '2026-09-20 12:00:00']);
        }
        $content = app(BuildWeeklyReportContent::class)->handle($district, '2026-W40');
        $this->assertSame(2, $content['case_universe']['cases']);
        $this->assertSame('2026-09-28', $content['period']['from']);
        $this->assertSame('2026-10-04', $content['period']['to']);
        $this->assertSame(2, $content['late_evidence']['reports_synced_after_period']);
        $this->assertSame([1, 0, 0, 0, 0, 0, 1], array_column($content['trend'], 'count'));
        $period = app(BuildWeeklyReportContent::class)->period('2026-W01');
        $this->assertSame('2025-12-29', $period['start']->toDateString());
    }

    public function test_unchanged_prepare_reuses_version_and_evidence_corrections_create_linked_versions(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->reviewer()->inDistrict($district)->create();
        $report = $this->report($district);
        $workflow = app(DistrictReportWorkflow::class);
        $one = $workflow->prepare($reviewer, '2026-W40');
        $this->travel(2)->days();
        $same = $workflow->prepare($reviewer, '2026-W40');
        $this->assertSame($one->id, $same->id);
        $report->update(['review_notes' => 'Corrected office note', 'lock_version' => 1]);
        $two = $workflow->prepare($reviewer, '2026-W40');
        $this->assertSame(2, $two->version);
        $this->assertSame($one->id, $two->supersedes_version_id);
        $this->assertSame('correction', $two->version_reason);
        $this->assertNotSame($one->content_hash, $two->content_hash);
        $this->assertSame($one->content, $one->fresh()->content);
        $this->report($district, ['submitted_at' => '2026-10-06 10:00:00', 'observed_at' => '2026-09-29 10:00:00']);
        $three = $workflow->prepare($reviewer, '2026-W40');
        $this->assertSame('late_evidence', $three->version_reason);
        $this->assertSame(1, $three->content['case_universe']['cases']);
        $this->assertSame(1, $three->content['late_evidence']['received_later_for_this_week']);
        $this->assertCount(2, $three->source_refs);
    }

    public function test_report_palette_is_the_authoritative_flat_token_ramp_and_map_has_real_polygons(): void
    {
        $palette = json_decode(file_get_contents(resource_path('maps/report-bands.json')), true);
        $css = file_get_contents(base_path('../src/styles/tokens.css'));
        foreach ($palette as $band => $color) {
            $this->assertStringContainsString('--kpi-band-'.$band.': '.$color, $css);
        }
        $district = $this->pilotDistrict();
        $this->report($district);
        $content = app(BuildWeeklyReportContent::class)->handle($district, '2026-W40');
        $map = app(WeeklyReportGraphics::class)->map($content)['svg'];
        $this->assertStringContainsString('<path', $map);
        $this->assertStringNotContainsString('https://', $map);
        $this->assertStringNotContainsString('<pattern', $map);
        $this->assertSame($map, app(WeeklyReportGraphics::class)->map($content)['svg']);
    }

    public function test_empty_week_keeps_all_five_rows_and_all_four_chart_families(): void
    {
        $content = app(BuildWeeklyReportContent::class)->handle($this->pilotDistrict(), '2026-W40');
        $this->assertCount(5, $content['diseases']);
        $this->assertCount(7, $content['trend']);
        $this->assertSame(0, $content['case_universe']['cases']);
        $this->assertCount(4, app(WeeklyReportGraphics::class)->charts($content));
    }

    public function test_paginated_barangay_charts_share_one_scale_instead_of_inflating_small_bars(): void
    {
        $content = app(BuildWeeklyReportContent::class)->handle($this->pilotDistrict(), '2026-W40');
        $content['barangays'] = array_map(fn ($index) => ['barangay' => 'Synthetic '.$index, 'cases' => $index === 0 ? 50 : 1, 'hectares_by_disease' => []], range(0, 12));
        $charts = app(WeeklyReportGraphics::class)->charts($content);
        $this->assertStringContainsString('width="4.9"', $charts[1]['svg']);
        $this->assertStringContainsString('width="4.9"', $charts[2]['svg']);
        $this->assertStringNotContainsString('width="245"', $charts[2]['svg']);
    }

    protected function report(District $district, array $attributes = []): Report
    {
        return Report::factory()->inDistrict($district)->create(array_replace([
            'submitted_at' => '2026-09-29 10:00:00', 'observed_at' => '2026-09-29 09:00:00',
            'predicted_label' => 'smut', 'authority_classified_condition' => null, 'reviewer_id' => null,
            'action_taken' => null, 'case_state' => 'open', 'verification_outcome' => 'not_determined',
            'field_validation_state' => 'unassigned', 'canonical_report_id' => null,
            'barangay' => 'Banilad', 'farmer_or_farm_owner_name' => 'Synthetic farm',
            'affected_area_hectares' => null, 'affected_area_measurement' => 'measured',
        ], $attributes));
    }
}
