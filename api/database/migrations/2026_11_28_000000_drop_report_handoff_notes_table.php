<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The offline handoff note feature is removed. Its plain records are dropped
 * by explicit product decision; historical expert referrals are unaffected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('report_handoff_notes');
    }

    public function down(): void
    {
        // Restores the empty schema only; dropped rows are not recoverable.
        if (Schema::hasTable('report_handoff_notes')) {
            return;
        }

        Schema::create('report_handoff_notes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('report_id')->constrained()->restrictOnDelete();
            $table->foreignId('recorded_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('destination', 160);
            $table->string('reference', 160)->nullable();
            $table->date('sent_date');
            $table->text('note')->nullable();
            $table->text('advice_received_note')->nullable();
            $table->timestamp('created_at');
        });
    }
};
