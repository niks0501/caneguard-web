<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->string('sugarcane_variety', 100)->nullable()->after('barangay');
            $table->string('crop_age', 100)->nullable()->after('sugarcane_variety');
            $table->string('cane_class', 100)->nullable()->after('crop_age');
            $table->decimal('affected_area_hectares', 12, 2)
                ->nullable()
                ->after('cane_class');
            $table->decimal('affected_portion_percent', 5, 2)
                ->nullable()
                ->after('affected_area_hectares');
            $table->text('field_notes')->nullable()->after('affected_portion_percent');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropColumn([
                'sugarcane_variety',
                'crop_age',
                'cane_class',
                'affected_area_hectares',
                'affected_portion_percent',
                'field_notes',
            ]);
        });
    }
};
