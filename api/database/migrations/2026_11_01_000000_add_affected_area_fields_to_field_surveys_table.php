<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Store the phone's affected-area survey evidence next to the walked
     * boundary: the damaged-area shapes, their combined measured size, how each
     * point and area figure was derived, and the per-area point history the
     * phone sends at the top level. All four stay nullable so existing
     * plot-only surveys remain valid without a backfill.
     */
    public function up(): void
    {
        if (! Schema::hasTable('field_surveys')) {
            return;
        }

        if (! Schema::hasColumn('field_surveys', 'affected_area_polygons')) {
            Schema::table('field_surveys', function (Blueprint $table): void {
                $table->json('affected_area_polygons')->nullable()->after('polygon');
            });
        }

        if (! Schema::hasColumn('field_surveys', 'affected_area_sqm')) {
            Schema::table('field_surveys', function (Blueprint $table): void {
                $table->decimal('affected_area_sqm', 20, 4)->nullable()->after('area_sqm');
            });
        }

        if (! Schema::hasColumn('field_surveys', 'measurement_provenance')) {
            Schema::table('field_surveys', function (Blueprint $table): void {
                $table->json('measurement_provenance')->nullable()->after('affected_area_sqm');
            });
        }

        if (! Schema::hasColumn('field_surveys', 'affected_area_waypoints')) {
            Schema::table('field_surveys', function (Blueprint $table): void {
                $table->json('affected_area_waypoints')->nullable()->after('measurement_provenance');
            });
        }
    }

    public function down(): void
    {
        // Preserve walked affected areas and their provenance. Removing survey
        // data requires a separate explicit decision.
    }
};
