<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('report_referrals', function (Blueprint $table): void {
            $table->string('condition_opinion', 40)->nullable()->after('finding_summary');
            $table->json('symptom_verdicts')->nullable()->after('condition_opinion');
            $table->string('finding_confidence', 16)->nullable()->after('finding_details');
            $table->string('consult_review_outcome', 16)->nullable()->after('finding_recorded_at');
            $table->text('consult_review_note')->nullable()->after('consult_review_outcome');
            $table->foreignId('consult_reviewed_by_id')
                ->nullable()
                ->after('consult_review_note')
                ->constrained('users')
                ->nullOnDelete();
            $table->dateTime('consult_reviewed_at', precision: 3)
                ->nullable()
                ->after('consult_reviewed_by_id');
            $table->index(['consult_status', 'consult_review_outcome']);
        });
    }

    public function down(): void
    {
        Schema::table('report_referrals', function (Blueprint $table): void {
            $table->dropIndex(['consult_status', 'consult_review_outcome']);
            $table->dropForeign(['consult_reviewed_by_id']);
            $table->dropColumn([
                'condition_opinion',
                'symptom_verdicts',
                'finding_confidence',
                'consult_review_outcome',
                'consult_review_note',
                'consult_reviewed_by_id',
                'consult_reviewed_at',
            ]);
        });
    }
};
