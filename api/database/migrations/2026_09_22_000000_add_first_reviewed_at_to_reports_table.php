<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->dateTime('first_reviewed_at', precision: 3)
                ->nullable()
                ->after('reviewed_at');
            $table->index(['case_state', 'first_reviewed_at']);
        });

        // Existing reviewed rows already have a trustworthy first available
        // review timestamp. Preserve that baseline instead of presenting every
        // historical case as new when the column is introduced.
        DB::table('reports')
            ->whereNotNull('reviewed_at')
            ->update(['first_reviewed_at' => DB::raw('reviewed_at')]);

        // Review events are the more precise historical source when they are
        // present. The report row stores only the latest review timestamp.
        if (Schema::hasTable('report_review_events')) {
            DB::table('report_review_events')
                ->select('report_id')
                ->selectRaw('MIN(created_at) AS first_reviewed_at')
                ->groupBy('report_id')
                ->orderBy('report_id')
                ->each(function (object $event): void {
                    DB::table('reports')
                        ->where('id', $event->report_id)
                        ->update(['first_reviewed_at' => $event->first_reviewed_at]);
                });
        }
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->dropIndex(['case_state', 'first_reviewed_at']);
            $table->dropColumn('first_reviewed_at');
        });
    }
};
