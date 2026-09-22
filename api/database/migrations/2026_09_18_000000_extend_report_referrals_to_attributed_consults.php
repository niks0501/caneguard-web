<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The report_id unique index also backs the existing foreign key on
        // MySQL, so remove the constraint before replacing that index.
        // Production drift tolerance: the key may already be gone (MySQL
        // 1091), in which case there is nothing to drop.
        try {
            Schema::table('report_referrals', function (Blueprint $table): void {
                $table->dropForeign(['report_id']);
            });
        } catch (QueryException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== 1091) {
                throw $e;
            }
        }

        // Same production drift tolerance as the foreign key above, in its
        // own statement so the guard catches execution errors, not just
        // command registration: the unique index may already be gone
        // (MySQL 1091).
        try {
            Schema::table('report_referrals', function (Blueprint $table): void {
                $table->dropUnique(['report_id']);
            });
        } catch (QueryException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== 1091) {
                throw $e;
            }
        }

        // A case may have more than one completed consult over time. The
        // application enforces one pending/in-progress consult at a time
        // while the report row is locked. Each column is added only when
        // missing: production already carries some of these columns from a
        // previous partial application, and MySQL aborts a multi-column
        // ALTER as a whole when any single column exists (error 1060).
        foreach ([
            'consult_status' => static fn (Blueprint $table) => $table->string('consult_status', 24)->default('pending')->after('report_id'),
            'due_date' => static fn (Blueprint $table) => $table->date('due_date')->nullable()->after('referral_date'),
            'expert_name' => static fn (Blueprint $table) => $table->string('expert_name', 160)->nullable()->after('due_date'),
            'expert_contact' => static fn (Blueprint $table) => $table->string('expert_contact', 320)->nullable()->after('expert_name'),
            'finding_summary' => static fn (Blueprint $table) => $table->text('finding_summary')->nullable()->after('response_finding'),
            'finding_details' => static fn (Blueprint $table) => $table->text('finding_details')->nullable()->after('finding_summary'),
            'finding_recommendation' => static fn (Blueprint $table) => $table->text('finding_recommendation')->nullable()->after('finding_details'),
            'finding_source' => static fn (Blueprint $table) => $table->string('finding_source', 16)->nullable()->after('finding_recommendation'),
            'finding_recorded_by_id' => static fn (Blueprint $table) => $table->foreignId('finding_recorded_by_id')->nullable()->after('response_recorded_by_id')->constrained('users')->nullOnDelete(),
            'finding_recorded_at' => static fn (Blueprint $table) => $table->dateTime('finding_recorded_at', precision: 3)->nullable()->after('response_recorded_at'),
        ] as $column => $define) {
            if (Schema::hasColumn('report_referrals', $column)) {
                continue;
            }
            Schema::table('report_referrals', function (Blueprint $table) use ($define): void {
                $define($table);
            });
        }

        // Same drift tolerance for the composite index (MySQL 1061, or an
        // equivalent already-exists failure on other drivers).
        try {
            Schema::table('report_referrals', function (Blueprint $table): void {
                $table->index(['report_id', 'consult_status']);
            });
        } catch (QueryException $e) {
            $driverCode = (int) ($e->errorInfo[1] ?? 0);
            $alreadyExists = $driverCode === 1061
                || str_contains($e->getMessage(), 'already exists');
            if (! $alreadyExists) {
                throw $e;
            }
        }

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
