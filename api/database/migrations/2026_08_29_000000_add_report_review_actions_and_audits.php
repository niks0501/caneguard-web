<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->string('action_taken', 64)
                ->nullable()
                ->after('referral_state');
        });

        Schema::create('report_audits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('report_id')
                ->constrained('reports')
                ->cascadeOnDelete();
            $table->foreignId('actor_id')
                ->constrained('users')
                ->restrictOnDelete();
            $table->string('field', 80);
            $table->text('original_value')->nullable();
            $table->text('corrected_value')->nullable();
            $table->text('reason');
            $table->timestamp('created_at', precision: 3);

            $table->index(['report_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_audits');

        Schema::table('reports', function (Blueprint $table): void {
            $table->dropColumn('action_taken');
        });
    }
};
