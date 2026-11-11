<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_aerial_analyses', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('report_id')->constrained()->cascadeOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->restrictOnDelete();
            $table->string('image_path');
            $table->string('image_mime_type', 64);
            $table->unsignedBigInteger('image_size_bytes');
            $table->unsignedInteger('image_width');
            $table->unsignedInteger('image_height');
            $table->string('mask_path');
            $table->unsignedInteger('mask_width');
            $table->unsignedInteger('mask_height');
            $table->decimal('normal_canopy_percent', 5, 2);
            $table->decimal('abnormal_canopy_percent', 5, 2);
            $table->decimal('canopy_coverage_percent', 5, 2);
            $table->string('model_version', 64);
            $table->char('weights_sha256', 64);
            $table->unsignedInteger('inference_ms');
            $table->timestamp('removed_at')->nullable();
            $table->foreignId('removed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['report_id', 'removed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_aerial_analyses');
    }
};
