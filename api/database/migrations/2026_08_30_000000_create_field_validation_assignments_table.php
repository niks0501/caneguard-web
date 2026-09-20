<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('field_validation_assignments', function (Blueprint $table): void {
            $table->id();
            $table->uuid()->unique();
            $table->foreignId('report_id')
                ->unique()
                ->constrained('reports')
                ->cascadeOnDelete();
            $table->foreignId('assignee_id')
                ->constrained('users')
                ->restrictOnDelete();
            $table->foreignId('assigned_by_id')
                ->constrained('users')
                ->restrictOnDelete();
            $table->date('target_visit_date')->nullable();
            $table->dateTime('activated_at', precision: 3);
            $table->timestamps(3);

            $table->index(['assignee_id', 'updated_at', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('field_validation_assignments');
    }
};
