<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
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
}
