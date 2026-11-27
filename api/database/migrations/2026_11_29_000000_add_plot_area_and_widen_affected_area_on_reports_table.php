<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Keep the three survey measurements separate on a report: total plot area,
     * affected ground area and the affected share.
     *
     * - affected_area_hectares widens from decimal(12,2) to decimal(12,4) so a
     *   real 40 m2 patch (0.0040 ha) is no longer rounded to 0.00, which would
     *   read as a measured zero. Widening a decimal never changes a stored value.
     * - plot_area_hectares and plot_area_measurement are new and nullable.
     *   Existing rows stay null and read as not measured until a deliberate,
     *   audited backfill; nothing here rewrites report data.
     */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->decimal('affected_area_hectares', 12, 4)->nullable()->change();
        });

        if (! Schema::hasColumn('reports', 'plot_area_hectares')) {
            Schema::table('reports', function (Blueprint $table): void {
                $table->decimal('plot_area_hectares', 12, 4)->nullable()->after('cane_class');
            });
        }

        if (! Schema::hasColumn('reports', 'plot_area_measurement')) {
            Schema::table('reports', function (Blueprint $table): void {
                $table->string('plot_area_measurement', 20)->nullable()->after('plot_area_hectares');
            });
        }
    }

    public function down(): void
    {
        // Only the new columns are removed. affected_area_hectares stays at
        // decimal(12,4): narrowing it would round recorded patches to 0.00 and
        // lose exactly the evidence this migration exists to keep.
        $columns = array_values(array_filter(
            ['plot_area_hectares', 'plot_area_measurement'],
            fn (string $column): bool => Schema::hasColumn('reports', $column),
        ));

        if ($columns !== []) {
            Schema::table('reports', function (Blueprint $table) use ($columns): void {
                $table->dropColumn($columns);
            });
        }
    }
};
