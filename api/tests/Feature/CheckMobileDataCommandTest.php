<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\FieldSurvey;
use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Proposal tests: each states the intent requirement it proves and none is
 * promoted to proof until the captain or aki-secondmate says so.
 */
class CheckMobileDataCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    // Proves: a well-formed assigned office row is not reported (no false alarm).
    public function test_a_valid_assigned_report_is_clean(): void
    {
        $this->assignedReport();

        $this->artisan('caneguard:check-mobile-data')
            ->expectsOutputToContain('no row would fail or stay hidden')
            ->assertSuccessful();
    }

    // Proves: a deliberately malformed SQL-inserted row is reported with its reference code and reason.
    public function test_a_malformed_sql_row_is_reported_with_reference_code_and_reason(): void
    {
        $report = $this->assignedReport();
        DB::table('reports')->where('id', $report->id)->update([
            'client_uuid' => 'not-a-uuid',
            'predicted_label' => 'bogus',
            'case_state' => 'archived',
        ]);

        $this->assertSame(1, Artisan::call('caneguard:check-mobile-data'));
        $output = Artisan::output();

        $this->assertStringContainsString($report->reference_code, $output);
        $this->assertStringContainsString('client_uuid is missing or not a UUID', $output);
        $this->assertStringContainsString('predicted_label must be one of', $output);
        $this->assertStringContainsString('only lists open cases', $output);
    }

    // Proves: a row marked assigned with no assignment row is listed as hidden from phones.
    public function test_assigned_state_without_an_assignment_row_is_hidden(): void
    {
        $report = $this->assignedReport();
        DB::table('field_validation_assignments')->delete();

        $this->assertSame(1, Artisan::call('caneguard:check-mobile-data'));
        $output = Artisan::output();
        $this->assertStringContainsString($report->reference_code, $output);
        $this->assertStringContainsString('no field_validation_assignments row', $output);
    }

    // Proves: an assigned case without an AI scan is reported as hidden from builds that do not ask for it.
    public function test_an_assigned_scanless_office_report_is_reported_as_hidden(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->fieldReporter()->create();
        $report = Report::factory()->inDistrict($district)->officeWithoutAiScan()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $report->id,
            'assignee_id' => $inspector->id,
        ]);

        $this->assertSame(1, Artisan::call('caneguard:check-mobile-data'));
        $output = Artisan::output();

        $this->assertStringContainsString($report->reference_code, $output);
        $this->assertStringContainsString('only builds that send supports=no_ai_scan receive this assignment', $output);
        $this->assertStringNotContainsString('predicted_label must be one of', $output);
    }

    // Proves: a flag that contradicts its figure is reported with its reference code.
    public function test_measurement_provenance_anomalies_are_reported(): void
    {
        $report = $this->assignedReport();
        DB::table('reports')->where('id', $report->id)->update([
            'affected_area_hectares' => 2,
            'affected_area_measurement' => 'not_measured',
            'plot_area_hectares' => null,
            'plot_area_measurement' => 'measured',
            'affected_portion_measurement' => 'maybe',
        ]);

        $this->assertSame(1, Artisan::call('caneguard:check-mobile-data'));
        $output = Artisan::output();

        $this->assertStringContainsString($report->reference_code, $output);
        $this->assertStringContainsString('wrong measurement', $output);
        $this->assertStringContainsString('affected_area_measurement is not_measured but affected_area_hectares holds', $output);
        $this->assertStringContainsString('plot_area_measurement is measured but plot_area_hectares is empty', $output);
        $this->assertStringContainsString("affected_portion_measurement 'maybe'", $output);
    }

    // Proves: a report that disagrees with the survey it names is reported, and one that agrees is not.
    public function test_report_and_survey_divergence_is_reported(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->fieldReporter()->create();
        $plotOnly = FieldSurvey::query()->create($this->survey($district, $inspector, ['affected_area_polygons' => [], 'affected_area_sqm' => 0]));
        $drawn = FieldSurvey::query()->create($this->survey($district, $inspector, ['affected_area_sqm' => 3000, 'affected_area_measurement' => 'measured']));

        $plotMapped = Report::factory()->inDistrict($district)->create([
            'field_survey_client_uuid' => $plotOnly->client_uuid,
            'affected_area_hectares' => 1.2, 'affected_area_measurement' => 'measured',
        ]);
        $diverged = Report::factory()->inDistrict($district)->create([
            'field_survey_client_uuid' => $drawn->client_uuid,
            'plot_area_hectares' => 3.5, 'plot_area_measurement' => 'measured',
            'affected_area_hectares' => 0.9, 'affected_area_measurement' => 'measured',
        ]);
        $agreeing = Report::factory()->inDistrict($district)->create([
            'field_survey_client_uuid' => $drawn->client_uuid,
            'plot_area_hectares' => 1.2, 'plot_area_measurement' => 'measured',
            'affected_area_hectares' => 0.3, 'affected_area_measurement' => 'measured',
        ]);

        $this->assertSame(1, Artisan::call('caneguard:check-mobile-data'));
        $output = Artisan::output();

        $this->assertStringContainsString($plotMapped->reference_code, $output);
        $this->assertStringContainsString('equals the plot area of a survey that measured no affected area', $output);
        $this->assertStringContainsString($diverged->reference_code, $output);
        $this->assertStringContainsString("differs from its survey's affected area of 0.3 ha", $output);
        $this->assertStringContainsString("differs from its survey's plot area of 1.2 ha", $output);
        $this->assertStringNotContainsString($agreeing->reference_code, $output);
    }

    // Proves: the check is read-only (it never writes).
    public function test_the_check_never_writes(): void
    {
        $report = $this->assignedReport();
        DB::table('reports')->where('id', $report->id)->update(['predicted_label' => 'bogus']);
        $before = [DB::table('reports')->get()->all(), DB::table('field_validation_assignments')->get()->all()];
        $writes = 0;
        DB::listen(function ($query) use (&$writes): void {
            if (! str_starts_with(strtolower(ltrim($query->sql)), 'select')) {
                $writes++;
            }
        });

        Artisan::call('caneguard:check-mobile-data');

        $this->assertSame(0, $writes);
        $this->assertEquals($before, [DB::table('reports')->get()->all(), DB::table('field_validation_assignments')->get()->all()]);
    }

    private function assignedReport(): Report
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->fieldReporter()->create();
        $report = Report::factory()->inDistrict($district)->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $report->id,
            'assignee_id' => $inspector->id,
        ]);

        return $report;
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function survey(District $district, User $inspector, array $attributes): array
    {
        return $attributes + [
            'client_uuid' => (string) Str::uuid(),
            'inspector_id' => $inspector->id,
            'district_id' => $district->id,
            'polygon' => ['type' => 'Polygon', 'coordinates' => [[[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]]]],
            'area_sqm' => 12000,
            'captured_at' => '2026-09-28 02:30:12.123456',
        ];
    }
}
