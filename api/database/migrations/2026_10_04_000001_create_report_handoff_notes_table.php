<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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

    public function down(): void
    {
        // Retain handoff records on rollback. Dropping live data requires a separate decision.
    }
};
