<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reports', function (Blueprint $table) {
            $table->id();
            $table->uuid()->unique();
            $table->string('reference_code', 32)->unique();
            $table->foreignId('reporter_id')->constrained('users')->restrictOnDelete();
            $table->uuid('client_uuid');
            $table->string('barangay', 120);

            $table->string('image_path', 500);
            $table->string('image_mime_type', 100);
            $table->unsignedBigInteger('image_size_bytes');
            $table->string('image_source_type', 20);
            $table->unsignedInteger('source_width')->nullable();
            $table->unsignedInteger('source_height')->nullable();

            $table->string('predicted_label', 32);
            $table->decimal('confidence', 8, 7);
            $table->string('checklist_consistency', 40);
            $table->string('reported_severity', 20)->nullable();
            $table->string('model_version', 100);

            $table->decimal('preprocess_ms', 12, 3);
            $table->decimal('inference_ms', 12, 3);
            $table->decimal('total_ms', 12, 3);

            $table->dateTime('captured_at', precision: 3);
            $table->dateTime('submitted_at', precision: 3);

            $table->string('review_status', 40)
                ->default('submitted_unverified');
            $table->text('review_notes')->nullable();
            $table->foreignId('reviewer_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->dateTime('reviewed_at', precision: 3)->nullable();

            $table->dateTime('created_at')->nullable();
            $table->dateTime('updated_at')->nullable();

            $table->unique(['reporter_id', 'client_uuid']);
            $table->index('submitted_at');
            $table->index(['review_status', 'submitted_at']);
            $table->index(['predicted_label', 'submitted_at']);
            $table->index(['barangay', 'submitted_at']);
            $table->index(['reporter_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reports');
    }
};
