<?php

namespace Tests\Feature;

use App\Actions\Reports\BuildWeeklyReportContent;
use App\Actions\Reports\BuildWeeklyRssiReport;
use App\Actions\Reports\ExportWeeklyRssiCsv;
use App\Models\District;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\LaravelPdf\Facades\Pdf;
use Spatie\LaravelPdf\PdfBuilder;
use Tests\TestCase;

class WeeklyRssiExportTest extends TestCase
{
    use RefreshDatabase;

    public function test_validated_and_suspected_rssi_cases_are_kept_apart_and_unrelated_records_are_excluded(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();

        $this->report($district, [
            'reference_code' => 'CG-VALIDATED',
            'barangay' => 'Banilad',
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'verified',
            'affected_area_hectares' => 2.5,
            'farmer_or_farm_owner_name' => 'PRIVATE VALIDATED FARM',
        ]);
        $this->report($district, [
            'reference_code' => 'CG-VALIDATED-2',
            'submitted_at' => '2026-10-01 03:00:00',
            'barangay' => '  Bucana ',
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'verified',
            'affected_area_hectares' => null,
            'farmer_or_farm_owner_name' => 'PRIVATE SECOND FARM',
        ]);
        $this->report($district, [
            'reference_code' => 'CG-REPORTER-SUSPECT',
            'barangay' => 'Banilad',
            'predicted_label' => 'unknown',
            'reporter_suspected_condition' => 'RSSI',
            'farmer_or_farm_owner_name' => 'PRIVATE SUSPECT FARM',
        ]);
        $this->report($district, [
            'reference_code' => 'CG-STAFF-SUSPECT',
            'barangay' => 'Bucana',
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'not_determined',
        ]);
        // Ruled out: another staff class, an AI-only label, a report received
        // outside the selected week, and a duplicate-linked report.
        $this->report($district, ['reference_code' => 'CG-MOSAIC', 'authority_classified_condition' => 'mosaic', 'verification_outcome' => 'verified']);
        $this->report($district, ['reference_code' => 'CG-RUST', 'predicted_label' => 'rust']);
        $this->report($district, ['reference_code' => 'CG-OTHER-WEEK', 'submitted_at' => '2026-09-22 10:00:00', 'authority_classified_condition' => 'rssi', 'verification_outcome' => 'verified']);
        $canonical = $this->report($district, ['reference_code' => 'CG-CANONICAL', 'predicted_label' => 'healthy']);
        $this->report($district, ['reference_code' => 'CG-DUPLICATE', 'canonical_report_id' => $canonical->id, 'authority_classified_condition' => 'rssi', 'verification_outcome' => 'verified']);

        $report = app(BuildWeeklyRssiReport::class)->handle(['period_type' => 'weekly', 'week' => '2026-W40'], $reviewer);

        $this->assertSame('weekly-rssi-report-v1', $report['contract']);
        $this->assertSame('2026-09-28', $report['period']['from']);
        $this->assertSame('2026-10-04', $report['period']['to']);
        $this->assertSame(2, $report['sections']['validated']['cases']);
        $this->assertSame(2, $report['sections']['suspected']['cases']);
        $this->assertTrue($report['sections']['suspected']['excluded_from_validated_totals']);
        $this->assertSame(
            ['CG-VALIDATED', 'CG-VALIDATED-2'],
            array_column($report['sections']['validated']['rows'], 'case_reference'),
        );
        $this->assertSame(
            ['CG-REPORTER-SUSPECT', 'CG-STAFF-SUSPECT'],
            array_column($report['sections']['suspected']['rows'], 'case_reference'),
        );
        $this->assertSame(['validated'], array_values(array_unique(array_column($report['sections']['validated']['rows'], 'section'))));
        $this->assertSame(['suspected'], array_values(array_unique(array_column($report['sections']['suspected']['rows'], 'section'))));
        $this->assertSame('Not measured', $report['sections']['validated']['rows'][1]['area_measurement']);
        $this->assertSame('Not classified', $report['sections']['suspected']['rows'][0]['staff_classification']);
        $payload = json_encode($report, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('PRIVATE', $payload);
        $this->assertStringNotContainsString('farmer_or_farm', $payload);
    }

    public function test_foreign_district_rssi_cases_are_excluded_from_the_pilot_export(): void
    {
        $district = $this->pilotDistrict();
        $foreign = District::query()->create(['code' => 'foreign-district', 'name' => 'Foreign district']);
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();

        $this->report($district, [
            'reference_code' => 'CG-PILOT-VALIDATED',
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'verified',
        ]);
        $this->report($foreign, [
            'reference_code' => 'CG-FOREIGN-VALIDATED',
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'verified',
        ]);
        $this->report($foreign, [
            'reference_code' => 'CG-FOREIGN-SUSPECT',
            'predicted_label' => 'unknown',
            'reporter_suspected_condition' => 'RSSI',
        ]);

        $report = app(BuildWeeklyRssiReport::class)->handle(['period_type' => 'weekly', 'week' => '2026-W40'], $reviewer);

        $this->assertSame(1, $report['sections']['validated']['cases']);
        $this->assertSame(0, $report['sections']['suspected']['cases']);
        $this->assertSame(['CG-PILOT-VALIDATED'], array_column($report['sections']['validated']['rows'], 'case_reference'));
        $this->assertSame('test-pilot', $report['district']['code'] ?? null);
        $this->assertStringNotContainsString('CG-FOREIGN', json_encode($report, JSON_THROW_ON_ERROR));
    }

    public function test_export_returns_no_cases_when_no_pilot_district_is_configured(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->report($district, [
            'reference_code' => 'CG-PILOT-VALIDATED',
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'verified',
        ]);

        config(['caneguard.pilot_district_code' => '']);

        $report = app(BuildWeeklyRssiReport::class)->handle(['period_type' => 'weekly', 'week' => '2026-W40'], $reviewer);

        $this->assertSame(0, $report['sections']['validated']['cases']);
        $this->assertSame(0, $report['sections']['suspected']['cases']);
        $this->assertNull($report['district']);
        $this->assertStringNotContainsString('CG-PILOT-VALIDATED', json_encode($report, JSON_THROW_ON_ERROR));
    }

    public function test_the_validated_total_uses_the_same_confirmation_rule_as_the_official_weekly_report(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->report($district, ['authority_classified_condition' => 'rssi', 'verification_outcome' => 'verified']);
        $this->report($district, ['authority_classified_condition' => 'rssi', 'verification_outcome' => 'not_determined']);
        $this->report($district, ['predicted_label' => 'unknown', 'reporter_suspected_condition' => 'RSSI']);
        $this->report($district, ['authority_classified_condition' => 'rssi', 'verification_outcome' => 'unable_to_verify']);

        $export = app(BuildWeeklyRssiReport::class)->handle(['period_type' => 'weekly', 'week' => '2026-W40'], $reviewer);
        $weekly = collect(app(BuildWeeklyReportContent::class)->handle($district, '2026-W40')['diseases'])->keyBy('key');

        $this->assertSame($weekly['rssi']['confirmed'], $export['sections']['validated']['cases']);
        $this->assertSame(
            $weekly['rssi']['suspected'] + $weekly['rssi']['under_review'],
            $export['sections']['suspected']['cases'],
        );
    }

    public function test_csv_download_marks_each_section_and_omits_farmer_names_and_infestation_percentage(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->report($district, [
            'reference_code' => 'CG-CSV-VALIDATED',
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'verified',
            'affected_area_hectares' => 1.25,
            'farmer_or_farm_owner_name' => 'PRIVATE CSV FARM',
        ]);
        $this->report($district, [
            'reference_code' => 'CG-CSV-SUSPECT',
            'barangay' => 'Bucana',
            'predicted_label' => 'unknown',
            'reporter_suspected_condition' => 'RSSI',
            'farmer_or_farm_owner_name' => 'PRIVATE CSV SUSPECT',
        ]);
        Sanctum::actingAs($reviewer);

        $response = $this->get('/api/v1/reports/rssi-weekly/export?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W40',
            'format' => 'csv',
        ]));

        $response->assertOk()
            ->assertHeader('Content-Type', 'text/csv; charset=UTF-8')
            ->assertHeaderContains('Content-Disposition', 'attachment; filename="caneguard-rssi-weekly-2026-09-28-to-2026-10-04.csv"');
        $csv = (string) $response->getContent();
        $rows = array_map('str_getcsv', array_values(array_filter(
            explode("\n", $csv),
            static fn (string $line): bool => trim($line) !== '',
        )));

        $this->assertContains(['Validated cases', '1'], $rows);
        $this->assertContains(['Suspected cases, excluded from validated totals', '1'], $rows);
        $this->assertContains(['Farmer and farm names', 'Not included'], $rows);
        $this->assertContains(['Infestation percentage', 'Not reported: CaneGuard has no confirmed calculation method for it.'], $rows);
        $this->assertContains(ExportWeeklyRssiCsv::HEADERS, $rows);
        foreach (ExportWeeklyRssiCsv::HEADERS as $header) {
            $this->assertStringNotContainsString('percent', $header);
            $this->assertStringNotContainsString('farmer', $header);
        }

        $cases = array_values(array_filter($rows, static fn (array $row): bool => in_array($row[0] ?? '', ['validated', 'suspected'], true)));
        $this->assertSame(
            [
                ['validated', 'CG-CSV-VALIDATED', '2026-09-29', 'Banilad', 'RSSI', 'Verified', '1.25', 'Measured'],
                ['suspected', 'CG-CSV-SUSPECT', '2026-09-29', 'Bucana', 'Not classified', 'Not determined', '', 'Not measured'],
            ],
            $cases,
        );
        $this->assertStringNotContainsString('PRIVATE CSV', $csv);
    }

    public function test_pdf_download_passes_both_sections_and_no_farmer_names_to_the_document(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->report($district, [
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'verified',
            'farmer_or_farm_owner_name' => 'PRIVATE PDF FARM',
        ]);
        $this->report($district, ['predicted_label' => 'unknown', 'reporter_suspected_condition' => 'RSSI']);
        Sanctum::actingAs($reviewer);
        $fake = Pdf::fake();

        $this->get('/api/v1/reports/rssi-weekly/export?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W40',
            'format' => 'pdf',
        ]))->assertOk();

        $fake->assertRespondedWithPdf(
            static fn (PdfBuilder $pdf): bool => $pdf->viewName === 'reports.rssi-weekly'
                && ($pdf->viewData['report']['sections']['validated']['cases'] ?? null) === 1
                && ($pdf->viewData['report']['sections']['suspected']['cases'] ?? null) === 1
                && ! str_contains(json_encode($pdf->viewData, JSON_THROW_ON_ERROR), 'PRIVATE PDF FARM'),
        );
    }

    public function test_pdf_render_failure_returns_a_csv_fallback_error(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        Sanctum::actingAs($reviewer);
        Pdf::shouldReceive('view')->andThrow(new \RuntimeException('renderer down'));

        $response = $this->get('/api/v1/reports/rssi-weekly/export?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W40',
            'format' => 'pdf',
        ]));

        $response->assertStatus(503);
        $response->assertJson([
            'message' => 'The PDF could not be generated. The CSV export is still available.',
            'code' => 'PDF_RENDER_FAILED',
        ]);
    }

    public function test_pdf_download_renders_an_a4_document(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->report($district, ['authority_classified_condition' => 'rssi', 'verification_outcome' => 'verified']);
        Sanctum::actingAs($reviewer);

        $response = $this->get('/api/v1/reports/rssi-weekly/export?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W40',
            'format' => 'pdf',
        ]));

        $response->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeaderContains('Content-Disposition', 'attachment; filename="caneguard-rssi-weekly-2026-09-28-to-2026-10-04.pdf"');
        $pdf = (string) $response->getContent();
        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertStringEndsWith('%%EOF', trim($pdf));
        $this->assertStringNotContainsString('Infestation percentage 12', $pdf);
    }

    public function test_export_requires_web_access_and_a_valid_reporting_period(): void
    {
        $district = $this->pilotDistrict();
        Sanctum::actingAs(User::factory()->inDistrict($district)->fieldReporter()->create());
        $this->getJson('/api/v1/reports/rssi-weekly/export?week=2026-W40')->assertForbidden();

        Sanctum::actingAs(User::factory()->inDistrict($district)->reviewer()->create());
        $this->getJson('/api/v1/reports/rssi-weekly/export?week=2026-W40&format=docx')->assertUnprocessable();
        $this->getJson('/api/v1/reports/rssi-weekly/export?period_type=yearly')->assertUnprocessable();
        $this->getJson('/api/v1/reports/rssi-weekly/export?period_type=custom&from=2026-10-05&to=2026-09-28')->assertUnprocessable();
        $this->get('/api/v1/reports/rssi-weekly/export?period_type=custom&from=2026-09-28&to=2026-10-04&format=csv')
            ->assertOk()
            ->assertHeaderContains('Content-Disposition', 'caneguard-rssi-weekly-2026-09-28-to-2026-10-04.csv');
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function report(District $district, array $attributes = []): Report
    {
        return Report::factory()->inDistrict($district)->create(array_replace([
            'submitted_at' => '2026-09-29 10:00:00',
            'observed_at' => '2026-09-29 09:00:00',
            'predicted_label' => 'smut',
            'reporter_suspected_condition' => null,
            'authority_classified_condition' => null,
            'verification_outcome' => 'not_determined',
            'case_state' => 'open',
            'field_validation_state' => 'unassigned',
            'canonical_report_id' => null,
            'barangay' => 'Banilad',
            'farmer_or_farm_owner_name' => 'Synthetic farm',
            'affected_area_hectares' => null,
            'affected_area_measurement' => 'measured',
        ], $attributes));
    }
}
