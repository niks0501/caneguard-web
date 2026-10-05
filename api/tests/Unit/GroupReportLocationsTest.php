<?php

namespace Tests\Unit;

use App\Actions\Reports\GroupReportLocations;
use App\Models\Report;
use Illuminate\Database\Eloquent\Collection;
use Tests\TestCase;

class GroupReportLocationsTest extends TestCase
{
    public function test_groups_are_transitive_order_independent_and_anchored_on_lowest_id(): void
    {
        $reports = new Collection([
            $this->point(3, 0, 0.00036),
            $this->point(1, 0, 0),
            $this->point(2, 0, 0.00018),
            $this->point(4, 0, 0.001),
        ]);
        app(GroupReportLocations::class)->handle($reports);
        foreach ($reports->where('id', '<', 4) as $report) {
            $this->assertSame('report-1', $report->location_group_key);
            $this->assertSame(3, $report->location_group_size);
            $this->assertSame([0.0, 0.0], $report->location_group_coordinates);
        }
        $this->assertSame(1, $reports->last()->location_group_size);
    }

    public function test_radius_is_configurable_and_works_across_grid_edges_dateline_and_poles(): void
    {
        foreach ([[0, 179.99995, 0, -179.99995], [89.99999, 0, 89.99999, 180], [14.1, 120.6, 14.10018, 120.6]] as [$aLat, $aLng, $bLat, $bLng]) {
            $reports = new Collection([$this->point(1, $aLat, $aLng), $this->point(2, $bLat, $bLng)]);
            app(GroupReportLocations::class)->handle($reports);
            $this->assertSame(2, $reports[0]->location_group_size);
        }
        config(['caneguard.map.location_group_radius_meters' => 10]);
        $reports = new Collection([$this->point(1, 14.1, 120.6), $this->point(2, 14.10018, 120.6)]);
        app(GroupReportLocations::class)->handle($reports);
        $this->assertSame(1, $reports[0]->location_group_size);
        $this->assertSame(1, $reports[1]->location_group_size);
        app(GroupReportLocations::class)->handle(new Collection);
    }

    public function test_the_25_meter_threshold_includes_near_and_excludes_far_pairs(): void
    {
        foreach ([[0.0002248, 2], [0.0002249, 1]] as [$latitude, $size]) {
            $reports = new Collection([$this->point(1, 0, 0), $this->point(2, $latitude, 0)]);
            app(GroupReportLocations::class)->handle($reports);
            $this->assertSame($size, $reports[0]->location_group_size);
        }
    }

    private function point(int $id, float $latitude, float $longitude): Report
    {
        return (new Report)->forceFill(['id' => $id, 'uuid' => 'report-'.$id, 'final_latitude' => $latitude, 'final_longitude' => $longitude]);
    }
}
