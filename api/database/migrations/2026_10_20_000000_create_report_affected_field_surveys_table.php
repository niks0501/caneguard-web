<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_affected_field_surveys', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('report_id')->constrained()->cascadeOnDelete();
            $table->foreignId('field_survey_id')->constrained()->restrictOnDelete();
            $table->decimal('loss_rate_percent', 5, 2);
            $table->timestamps();
            $table->unique(['report_id', 'field_survey_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_affected_field_surveys');
    }
};
