<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_review_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('report_id')
                ->constrained('reports')
                ->cascadeOnDelete();
            $table->foreignId('actor_id')
                ->constrained('users')
                ->restrictOnDelete();
            $table->string('action_taken', 64)->nullable();
            $table->string('authority_classified_condition', 64)->nullable();
            $table->string('verification_outcome', 64)->nullable();
            $table->text('notes')->nullable();
            $table->string('case_state', 32)->nullable();
            $table->timestamp('created_at', precision: 3);

            $table->index(['report_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_review_events');
    }
};
