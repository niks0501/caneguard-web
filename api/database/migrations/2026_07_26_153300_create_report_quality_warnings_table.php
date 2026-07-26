<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_quality_warnings', function (Blueprint $table) {
            $table->foreignId('report_id')
                ->constrained('reports')
                ->cascadeOnDelete();
            $table->string('warning_key', 50);

            $table->primary(['report_id', 'warning_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_quality_warnings');
    }
};
