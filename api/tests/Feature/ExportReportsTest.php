<?php

namespace Tests\Feature;

use App\Actions\Reports\ExportReports;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExportReportsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    public function test_csv_exports_plot_area_affected_area_and_percent_separately_and_distinguishes_zero_tiny_and_unmeasured(): void
    {
        $reviewer = User::factory()->reviewer()->create();

        Report::factory()->create([
            'reference_code' => 'CG-AC1-SEPARATED',
            'plot_area_hectares' => 1.2,
            'plot_area_measurement' => Report::MEASUREMENT_MEASURED,
            'affected_area_hectares' => 0.3,
            'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
            'affected_portion_percent' => 25,
            'affected_portion_measurement' => Report::MEASUREMENT_MEASURED,
            'submitted_at' => CarbonImmutable::parse('2026-09-05T10:00:00Z'),
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-AC4-ZERO',
            'plot_area_hectares' => 1.2,
            'plot_area_measurement' => Report::MEASUREMENT_MEASURED,
            'affected_area_hectares' => 0,
            'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
            'affected_portion_percent' => 0,
            'affected_portion_measurement' => Report::MEASUREMENT_MEASURED,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T10:00:00Z'),
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-AC4-TINY',
            'plot_area_hectares' => 1.2,
            'plot_area_measurement' => Report::MEASUREMENT_MEASURED,
            'affected_area_hectares' => 0.004,
            'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
            'affected_portion_percent' => 0.3,
            'affected_portion_measurement' => Report::MEASUREMENT_MEASURED,
            'submitted_at' => CarbonImmutable::parse('2026-09-03T10:00:00Z'),
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-AC4-UNMEASURED',
            'plot_area_hectares' => 1.2,
            'plot_area_measurement' => Report::MEASUREMENT_MEASURED,
            'affected_area_hectares' => null,
            'affected_area_measurement' => Report::MEASUREMENT_NOT_MEASURED,
            'affected_portion_percent' => null,
            'affected_portion_measurement' => Report::MEASUREMENT_NOT_MEASURED,
            'submitted_at' => CarbonImmutable::parse('2026-09-02T10:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $csv = $this->get('/api/v1/reports/export')->assertOk()->streamedContent();
        $rows = array_map(
            'str_getcsv',
            array_values(array_filter(preg_split('/\r\n|\r|\n/', trim($csv)) ?: [])),
        );

        $headers = $rows[0];
        $this->assertSame(ExportReports::HEADERS, $headers);
        $this->assertSame('plot_area_hectares', $headers[24]);
        $this->assertSame('plot_area_measurement', $headers[25]);

        $byRef = collect(array_slice($rows, 1))->keyBy(fn (array $row): string => $row[0]);

        $separated = $byRef['CG-AC1-SEPARATED'];
        $this->assertSame('0.3', $separated[5]);
        $this->assertSame('Measured', $separated[6]);
        $this->assertSame('25', $separated[7]);
        $this->assertSame('Measured', $separated[8]);
        $this->assertSame('1.2', $separated[24]);
        $this->assertSame('Measured', $separated[25]);

        $zero = $byRef['CG-AC4-ZERO'];
        $this->assertSame('0', $zero[5]);
        $this->assertSame('Measured', $zero[6]);
        $this->assertSame('0', $zero[7]);
        $this->assertSame('Measured', $zero[8]);
        $this->assertSame('1.2', $zero[24]);
        $this->assertSame('Measured', $zero[25]);

        $tiny = $byRef['CG-AC4-TINY'];
        $this->assertSame('0.004', $tiny[5]);
        $this->assertSame('Measured', $tiny[6]);

        $unmeasured = $byRef['CG-AC4-UNMEASURED'];
        $this->assertSame('', $unmeasured[5]);
        $this->assertSame('Not measured', $unmeasured[6]);
        $this->assertSame('', $unmeasured[7]);
        $this->assertSame('Not measured', $unmeasured[8]);
        $this->assertSame('1.2', $unmeasured[24]);
        $this->assertSame('Measured', $unmeasured[25]);
    }
}
