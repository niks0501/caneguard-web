<?php

namespace Tests\Unit;

use App\Support\AreaFormatter;
use PHPUnit\Framework\TestCase;

class AreaFormatterTest extends TestCase
{
    public function test_formats_generic_hectares_preserving_small_patch_precision(): void
    {
        $this->assertSame('1.2 ha', AreaFormatter::formatHectares(1.2));
        $this->assertSame('0.3 ha', AreaFormatter::formatHectares(0.3));
        $this->assertSame('0.61 ha', AreaFormatter::formatHectares(0.6075123));
        $this->assertSame('1 ha', AreaFormatter::formatHectares(1));
        $this->assertSame('2.4 ha', AreaFormatter::formatHectares(2.4));
        $this->assertSame('0.02 ha', AreaFormatter::formatHectares(0.015));
        $this->assertSame('0 ha', AreaFormatter::formatHectares(0));
        $this->assertSame('0 ha', AreaFormatter::formatHectares('0.0000'));
        $this->assertSame('0.004 ha', AreaFormatter::formatHectares(0.004));
        $this->assertSame('0.004 ha', AreaFormatter::formatHectares('0.0040'));
        $this->assertSame('0.0049 ha', AreaFormatter::formatHectares(49 / 10_000));
        $this->assertSame('0.005 ha', AreaFormatter::formatHectares(0.005));
        $this->assertSame('0.00004 ha', AreaFormatter::formatHectares(0.4 / 10_000));
        $this->assertSame('—', AreaFormatter::formatHectares(null));
    }

    public function test_distinguishes_unmeasured_from_confirmed_zero_for_area_and_percent(): void
    {
        $this->assertSame('Not measured', AreaFormatter::formatMeasuredHectares(null, 'not_measured'));
        $this->assertSame('Not measured', AreaFormatter::formatMeasuredHectares(0, 'not_measured'));
        $this->assertSame('Not measured', AreaFormatter::formatMeasuredHectares(1.2, 'Not measured'));
        $this->assertSame('0 ha', AreaFormatter::formatMeasuredHectares(0, 'measured'));
        $this->assertSame('0.004 ha', AreaFormatter::formatMeasuredHectares(0.004, 'measured'));
        $this->assertSame('0.3 ha', AreaFormatter::formatMeasuredHectares(0.3, 'measured'));

        $this->assertSame('Not measured', AreaFormatter::formatMeasuredPercent(null, 'not_measured'));
        $this->assertSame('Not measured', AreaFormatter::formatMeasuredPercent(0, 'not_measured'));
        $this->assertSame('0%', AreaFormatter::formatMeasuredPercent(0, 'measured'));
        $this->assertSame('<0.01%', AreaFormatter::formatMeasuredPercent(0, 'measured', positiveArea: true));
        $this->assertSame('<0.01%', AreaFormatter::formatMeasuredPercent(0.004, 'measured'));
        $this->assertSame('0.04%', AreaFormatter::formatMeasuredPercent(0.04, 'measured'));
        $this->assertSame('25%', AreaFormatter::formatMeasuredPercent(25, 'measured'));
        $this->assertSame('42.75%', AreaFormatter::formatMeasuredPercent(42.75, 'measured'));
        $this->assertSame('100%', AreaFormatter::formatMeasuredPercent(100, 'measured'));
    }

    public function test_formats_csv_numeric_cells_without_rounding_tiny_patches_or_leaking_unmeasured(): void
    {
        $this->assertSame('1.2', AreaFormatter::formatCsvHectares('1.2000', 'measured'));
        $this->assertSame('0.3', AreaFormatter::formatCsvHectares('0.3000', 'measured'));
        $this->assertSame('1.25', AreaFormatter::formatCsvHectares(1.25, 'Measured'));
        $this->assertSame('0.004', AreaFormatter::formatCsvHectares('0.0040', 'measured'));
        $this->assertSame('0', AreaFormatter::formatCsvHectares('0.0000', 'measured'));
        $this->assertSame('', AreaFormatter::formatCsvHectares('1.2000', 'not_measured'));
        $this->assertSame('', AreaFormatter::formatCsvHectares(null, 'not_measured'));

        $this->assertSame('25', AreaFormatter::formatCsvPercent('25.00', 'measured'));
        $this->assertSame('42.75', AreaFormatter::formatCsvPercent('42.75', 'measured'));
        $this->assertSame('0', AreaFormatter::formatCsvPercent('0.00', 'measured'));
        $this->assertSame('', AreaFormatter::formatCsvPercent('25.00', 'not_measured'));
    }
}
