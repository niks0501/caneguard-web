<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Append-only record of changes made to a field survey after it was synced,
     * shaped like report_audits: one row per field with its old and new value.
     * The audited measurement backfill (caneguard:audit-survey-measurements
     * --apply) is its first writer; nothing else reads or prunes it.
     */
    public function up(): void
    {
        if (Schema::hasTable('field_survey_audits')) {
            return;
        }

        Schema::create('field_survey_audits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('field_survey_id')
                ->constrained('field_surveys')
                ->cascadeOnDelete();
            $table->foreignId('actor_id')
                ->constrained('users')
                ->restrictOnDelete();
            $table->string('field', 80);
            $table->text('original_value')->nullable();
            $table->text('corrected_value')->nullable();
            $table->text('reason');
            $table->timestamp('created_at', precision: 3);

            $table->index(['field_survey_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('field_survey_audits');
    }
};
