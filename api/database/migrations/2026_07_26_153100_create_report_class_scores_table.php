<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_class_scores', function (Blueprint $table) {
            $table->foreignId('report_id')
                ->constrained('reports')
                ->cascadeOnDelete();
            $table->string('label', 32);
            $table->decimal('score', 8, 7);

            $table->primary(['report_id', 'label']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_class_scores');
    }
};
