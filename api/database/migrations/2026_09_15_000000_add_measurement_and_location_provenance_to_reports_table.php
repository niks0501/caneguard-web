<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * D-01 / D-02 provenance: record whether an affected-area value was actually
     * measured, and why an exact location could not be captured.
     */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->string('affected_area_measurement', 20)
                ->nullable()
                ->after('affected_area_hectares');
            $table->string('affected_portion_measurement', 20)
                ->nullable()
                ->after('affected_portion_percent');
            $table->string('location_unavailable_reason', 40)
                ->nullable()
                ->after('location_source');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropColumn([
                'affected_area_measurement',
                'affected_portion_measurement',
                'location_unavailable_reason',
            ]);
        });
    }
};
