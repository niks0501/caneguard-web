<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A field map can carry an inspector-typed name, and can record the earlier
     * map whose plot outline it reused. The new map always owns its own copy of
     * the polygon, so the source can change or disappear without altering it.
     */
    public function up(): void
    {
        Schema::table('field_surveys', function (Blueprint $table): void {
            $table->string('label', 60)->nullable()->after('area_sqm');
            $table->foreignId('outline_from_survey_id')
                ->nullable()
                ->after('label')
                ->constrained('field_surveys')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('field_surveys', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('outline_from_survey_id');
            $table->dropColumn('label');
        });
    }
};
