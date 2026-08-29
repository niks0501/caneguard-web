<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_referrals', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('report_id')
                ->unique()
                ->constrained('reports')
                ->cascadeOnDelete();
            $table->foreignId('referred_by_id')
                ->constrained('users')
                ->restrictOnDelete();
            $table->string('destination', 160);
            $table->string('reference', 160);
            $table->date('referral_date');
            $table->text('note')->nullable();
            $table->date('response_date')->nullable();
            $table->text('response_note')->nullable();
            $table->text('response_finding')->nullable();
            $table->foreignId('response_recorded_by_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->dateTime('response_recorded_at', precision: 3)->nullable();

            // Keep the office position at handoff time separate from later
            // review edits so a referral summary remains historically useful.
            $table->string('office_case_state', 16);
            $table->string('office_verification_outcome', 32);
            $table->string('office_field_validation_state', 32);
            $table->string('office_action_taken', 64)->nullable();
            $table->string('office_authority_classified_condition', 40)->nullable();
            $table->text('office_review_notes')->nullable();
            $table->foreignId('office_reviewer_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->dateTime('office_reviewed_at', precision: 3)->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_referrals');
    }
};
