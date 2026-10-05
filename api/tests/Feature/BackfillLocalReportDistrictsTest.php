<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\Report;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class BackfillLocalReportDistrictsTest extends TestCase
{
    use RefreshDatabase;

    public function test_backfill_stamps_only_null_rows_preserves_evidence_and_is_safe_to_rerun(): void
    {
        $pilot = $this->pilotDistrict();
        $other = District::query()->create(['code' => 'other', 'name' => 'Other district']);
        $unstamped = Report::factory()->create(['district_id' => null]);
        Report::factory()->inDistrict($pilot)->create();
        Report::factory()->inDistrict($other)->create();
        $before = $this->reportRows();
        $evidence = DB::table('report_class_scores')->get()->toArray();

        $this->artisan('caneguard:backfill-local-report-districts')
            ->expectsOutput('Stamped 1 unstamped local reports.')
            ->assertSuccessful();
        $expected = $before;
        $expected[$unstamped->id]['district_id'] = $pilot->id;
        $this->assertSame($expected, $this->reportRows());
        $this->assertEquals($evidence, DB::table('report_class_scores')->get()->toArray());

        $this->artisan('caneguard:backfill-local-report-districts')
            ->expectsOutput('Stamped 0 unstamped local reports.')
            ->assertSuccessful();
        $this->assertSame($expected, $this->reportRows());
    }

    public function test_backfill_requires_an_existing_configured_pilot(): void
    {
        Report::factory()->create(['district_id' => null]);
        $before = $this->reportRows();
        $this->artisan('caneguard:backfill-local-report-districts')->assertFailed();
        $this->assertSame($before, $this->reportRows());
        $this->assertDatabaseCount('districts', 0);

        District::query()->create(['code' => 'other', 'name' => 'Other district']);
        config(['caneguard.pilot_district_code' => 'missing']);
        $this->artisan('caneguard:backfill-local-report-districts')->assertFailed();
        $this->assertSame($before, $this->reportRows());
    }

    public function test_backfill_refuses_production_even_with_a_configured_pilot(): void
    {
        $this->pilotDistrict();
        Report::factory()->create(['district_id' => null]);
        $before = $this->reportRows();
        $this->app->instance('env', 'production');

        $this->artisan('caneguard:backfill-local-report-districts')
            ->expectsOutput('This backfill is only available in local and testing environments.')
            ->assertFailed();
        $this->assertSame($before, $this->reportRows());
    }

    private function reportRows(): array
    {
        return DB::table('reports')->orderBy('id')->get()
            ->keyBy('id')->map(fn (object $row): array => (array) $row)->all();
    }
}
