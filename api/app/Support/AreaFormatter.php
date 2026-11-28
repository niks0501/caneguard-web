<?php

namespace App\Support;

use App\Models\Report;

/**
 * Shared area and percentage formatter matching the web TypeScript formatters:
 * preserves 3-4+ decimals for small positive areas (0 < v < 0.01 ha) so tiny
 * patches like 40 m^2 (0.004 ha) never round to 0.00, renders confirmed zero
 * as "0 ha" / "0%", and renders unmeasured values as "Not measured".
 */
final class AreaFormatter
{
    public const UNMEASURED_LABEL = 'Not measured';

    public const MEASURED_LABEL = 'Measured';

    public static function isNotMeasured(?string $measurement): bool
    {
        if ($measurement === null) {
            return false;
        }

        $normalized = strtolower(trim($measurement));

        return $normalized === Report::MEASUREMENT_NOT_MEASURED
            || $normalized === 'not measured';
    }

    public static function measurementLabel(string $measurement): string
    {
        return self::isNotMeasured($measurement)
            ? self::UNMEASURED_LABEL
            : self::MEASURED_LABEL;
    }

    /**
     * Format any numeric hectare value for human display without the " ha" unit.
     */
    public static function formatHectaresNumber(
        float|int|string|null $hectares,
        ?string $fallback = null,
    ): ?string {
        if ($hectares === null || $hectares === '') {
            return $fallback;
        }

        $value = (float) $hectares;
        if (! is_finite($value)) {
            return $fallback;
        }

        if ($value === 0.0) {
            return '0';
        }

        $abs = abs($value);
        if ($abs < 0.01) {
            $decimals = min(8, max(4, (int) ceil(-log10($abs)) + 1));
            $formatted = number_format($value, $decimals, '.', '');

            return rtrim(rtrim($formatted, '0'), '.');
        }

        $formatted = number_format($value, 2, '.', ',');

        return rtrim(rtrim($formatted, '0'), '.');
    }

    /**
     * Generic area formatter for any hectare figure (e.g. total plot area).
     */
    public static function formatHectares(
        float|int|string|null $hectares,
        string $fallback = '—',
    ): string {
        $formatted = self::formatHectaresNumber($hectares);

        return $formatted === null ? $fallback : $formatted.' ha';
    }

    /**
     * Tri-state area formatter distinguishing unmeasured ("Not measured"),
     * confirmed zero ("0 ha"), and measured positive areas.
     */
    public static function formatMeasuredHectares(
        float|int|string|null $hectares,
        ?string $measurement = null,
        string $unmeasuredLabel = self::UNMEASURED_LABEL,
    ): string {
        if (self::isNotMeasured($measurement)) {
            return $unmeasuredLabel;
        }

        return self::formatHectares($hectares, $unmeasuredLabel);
    }

    /**
     * Tri-state percentage formatter distinguishing unmeasured ("Not measured"),
     * confirmed zero ("0%"), sub-0.01% positive patches ("<0.01%"), and measured percentages.
     */
    public static function formatMeasuredPercent(
        float|int|string|null $percent,
        ?string $measurement = null,
        string $unmeasuredLabel = self::UNMEASURED_LABEL,
        bool $positiveArea = false,
    ): string {
        if (self::isNotMeasured($measurement) || $percent === null || $percent === '') {
            return $unmeasuredLabel;
        }

        $value = (float) $percent;
        if (! is_finite($value)) {
            return $unmeasuredLabel;
        }

        if ($value === 0.0) {
            return $positiveArea ? '<0.01%' : '0%';
        }

        if ($value > 0.0 && $value < 0.01) {
            return '<0.01%';
        }

        $formatted = rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');

        return $formatted.'%';
    }

    /**
     * Numeric hectare string for CSV cells (no commas or unit): empty when
     * unmeasured, "0" for confirmed zero, and up to 4+ decimals for small patches.
     */
    public static function formatCsvHectares(
        float|int|string|null $hectares,
        ?string $measurement = null,
    ): string {
        if (self::isNotMeasured($measurement) || $hectares === null || $hectares === '') {
            return '';
        }

        $value = (float) $hectares;
        if (! is_finite($value)) {
            return '';
        }

        if ($value === 0.0) {
            return '0';
        }

        $abs = abs($value);
        $decimals = $abs < 0.01
            ? min(8, max(4, (int) ceil(-log10($abs)) + 1))
            : 4;
        $formatted = number_format($value, $decimals, '.', '');

        return rtrim(rtrim($formatted, '0'), '.');
    }

    /**
     * Numeric percentage string for CSV cells: empty when unmeasured, "0" for
     * confirmed zero, and up to 2 decimals otherwise.
     */
    public static function formatCsvPercent(
        float|int|string|null $percent,
        ?string $measurement = null,
    ): string {
        if (self::isNotMeasured($measurement) || $percent === null || $percent === '') {
            return '';
        }

        $value = (float) $percent;
        if (! is_finite($value)) {
            return '';
        }

        if ($value === 0.0) {
            return '0';
        }

        return rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
    }
}
