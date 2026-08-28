<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('field_validation_completions', function (Blueprint $table): void {
            $table->id();
            $table->uuid()->unique();
            $table->foreignId('assignment_id')
                ->unique()
                ->constrained('field_validation_assignments')
                ->cascadeOnDelete();
            $table->uuid('client_uuid')->unique();
            $table->text('field_observation');
            $table->text('field_finding');
            $table->text('action_taken');
            $table->dateTime('visited_at', precision: 3);
            $table->string('gps_outcome', 32);
            $table->dateTime('gps_attempted_at', precision: 3);
            $table->decimal('gps_latitude', 10, 7)->nullable();
            $table->decimal('gps_longitude', 10, 7)->nullable();
            $table->decimal('gps_accuracy', 8, 2)->nullable();
            $table->string('fresh_photo_path')->nullable();
            $table->string('fresh_photo_mime_type', 64)->nullable();
            $table->unsignedBigInteger('fresh_photo_size_bytes')->nullable();
            $table->timestamps(3);

            $table->index(['assignment_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('field_validation_completions');
    }
};
