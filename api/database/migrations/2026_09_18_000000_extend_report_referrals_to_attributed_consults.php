<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The report_id unique index also backs the existing foreign key on
        // MySQL, so remove the constraint before replacing that index.
        Schema::table('report_referrals', function (Blueprint $table): void {
            $table->dropForeign(['report_id']);
        });

        Schema::table('report_referrals', function (Blueprint $table): void {
            // A case may have more than one completed consult over time. The
            // application enforces one pending/in-progress consult at a time
            // while the report row is locked.
            $table->dropUnique(['report_id']);
            $table->string('consult_status', 24)->default('pending')->after('report_id');
            $table->date('due_date')->nullable()->after('referral_date');
            $table->string('expert_name', 160)->nullable()->after('due_date');
            $table->string('expert_contact', 320)->nullable()->after('expert_name');
            $table->text('finding_summary')->nullable()->after('response_finding');
            $table->text('finding_details')->nullable()->after('finding_summary');
            $table->text('finding_recommendation')->nullable()->after('finding_details');
            $table->string('finding_source', 16)->nullable()->after('finding_recommendation');
            $table->foreignId('finding_recorded_by_id')
                ->nullable()
                ->after('response_recorded_by_id')
                ->constrained('users')
                ->nullOnDelete();
            $table->dateTime('finding_recorded_at', precision: 3)->nullable()->after('response_recorded_at');
            $table->index(['report_id', 'consult_status']);
        });

        // Existing response rows are completed consults. Older handoffs with
        // no response remain pending and are therefore still protected by the
        // active-consult rule.
        DB::table('report_referrals')
            ->whereNotNull('response_date')
            ->update([
                'consult_status' => 'completed',
                'finding_source' => 'transcribed',
            ]);
        DB::table('report_referrals')
            ->whereNull('response_date')
            ->update(['consult_status' => 'pending']);

        DB::table('report_referrals')
            ->orderBy('id')
            ->eachById(function (object $referral): void {
                DB::table('report_referrals')
                    ->where('id', $referral->id)
                    ->update([
                        'finding_summary' => $referral->response_note,
                        'finding_details' => $referral->response_finding,
                        'finding_recorded_by_id' => $referral->response_recorded_by_id,
                        'finding_recorded_at' => $referral->response_recorded_at,
                    ]);
            });
    }

    public function down(): void
    {
        Schema::table('report_referrals', function (Blueprint $table): void {
            $table->dropIndex(['report_id', 'consult_status']);
            $table->dropForeign(['finding_recorded_by_id']);
            $table->dropColumn([
                'consult_status',
                'due_date',
                'expert_name',
                'expert_contact',
                'finding_summary',
                'finding_details',
                'finding_recommendation',
                'finding_source',
                'finding_recorded_by_id',
                'finding_recorded_at',
            ]);
            $table->unique('report_id');
            $table->foreign('report_id')
                ->references('id')
                ->on('reports')
                ->cascadeOnDelete();
        });
    }
};
