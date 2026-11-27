<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Record whether a survey's affected area was measured. Nullable so existing
     * surveys are untouched: a null reads as the legacy inference (see
     * FieldSurvey::affectedAreaMeasurement()) until an audited backfill runs.
     */
    public function up(): void
    {
        if (! Schema::hasTable('field_surveys')
            || Schema::hasColumn('field_surveys', 'affected_area_measurement')) {
            return;
        }

        Schema::table('field_surveys', function (Blueprint $table): void {
            $table->string('affected_area_measurement', 20)->nullable()->after('affected_area_sqm');
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('field_surveys')
            && Schema::hasColumn('field_surveys', 'affected_area_measurement')) {
            Schema::table('field_surveys', function (Blueprint $table): void {
                $table->dropColumn('affected_area_measurement');
            });
        }
    }
};
