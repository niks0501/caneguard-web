<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('field_surveys')) {
            return;
        }

        Schema::create('field_surveys', function (Blueprint $table): void {
            $table->id();
            $table->uuid('client_uuid')->unique();
            $table->foreignId('inspector_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('district_id')->constrained()->restrictOnDelete();
            $table->json('polygon');
            $table->double('area_sqm');
            $table->dateTime('captured_at', 6);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        // Preserve walked boundaries. Removing survey data requires a separate decision.
    }
};
