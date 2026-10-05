<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Production drift tolerance: the table may already exist from a
        // previous partial application (MySQL 1050); creating it again
        // would abort deployment boot.
        if (Schema::hasTable('report_referral_symptom_findings')) {
            return;
        }

        Schema::create('report_referral_symptom_findings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('report_referral_id')
                ->constrained('report_referrals')
                ->cascadeOnDelete();
            $table->string('symptom_key', 160);
            $table->string('verdict', 16);
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unique(['report_referral_id', 'symptom_key'], 'rrsf_referral_symptom_unique');
            $table->index(['symptom_key', 'verdict'], 'rrsf_symptom_verdict_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_referral_symptom_findings');
    }
};
