<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An office-born case may exist without a scan or a photo. Phone uploads
     * keep requiring every one of these through their request validation.
     */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->string('image_path', 500)->nullable()->change();
            $table->string('image_mime_type', 100)->nullable()->change();
            $table->unsignedBigInteger('image_size_bytes')->nullable()->change();
            $table->string('image_source_type', 20)->nullable()->change();
            $table->string('predicted_label', 32)->nullable()->change();
            $table->decimal('confidence', 8, 7)->nullable()->change();
            $table->string('checklist_consistency', 40)->nullable()->change();
            $table->string('model_version', 100)->nullable()->change();
            $table->decimal('preprocess_ms', 12, 3)->nullable()->change();
            $table->decimal('inference_ms', 12, 3)->nullable()->change();
            $table->decimal('total_ms', 12, 3)->nullable()->change();
        });
    }

    public function down(): void
    {
        if (DB::table('reports')->where(function ($query): void {
            $query->whereNull('image_path')
                ->orWhereNull('image_mime_type')
                ->orWhereNull('image_size_bytes')
                ->orWhereNull('image_source_type')
                ->orWhereNull('predicted_label')
                ->orWhereNull('confidence')
                ->orWhereNull('checklist_consistency')
                ->orWhereNull('model_version')
                ->orWhereNull('preprocess_ms')
                ->orWhereNull('inference_ms')
                ->orWhereNull('total_ms');
        })->exists()) {
            throw new RuntimeException('Rows without an AI scan or photo exist; refusing to make the columns required again.');
        }

        Schema::table('reports', function (Blueprint $table): void {
            $table->string('image_path', 500)->nullable(false)->change();
            $table->string('image_mime_type', 100)->nullable(false)->change();
            $table->unsignedBigInteger('image_size_bytes')->nullable(false)->change();
            $table->string('image_source_type', 20)->nullable(false)->change();
            $table->string('predicted_label', 32)->nullable(false)->change();
            $table->decimal('confidence', 8, 7)->nullable(false)->change();
            $table->string('checklist_consistency', 40)->nullable(false)->change();
            $table->string('model_version', 100)->nullable(false)->change();
            $table->decimal('preprocess_ms', 12, 3)->nullable(false)->change();
            $table->decimal('inference_ms', 12, 3)->nullable(false)->change();
            $table->decimal('total_ms', 12, 3)->nullable(false)->change();
        });
    }
};
