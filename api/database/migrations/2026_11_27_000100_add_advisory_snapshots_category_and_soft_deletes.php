<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('advisories', function (Blueprint $table): void {
            $table->string('category', 16)->nullable()->after('content');
            $table->softDeletes();
        });

        Schema::table('reports', function (Blueprint $table): void {
            // The wording the reporter was actually sent, frozen when the advisory was selected.
            $table->string('advisory_title_snapshot', 160)->nullable()->after('advisory_id');
            $table->text('advisory_content_snapshot')->nullable()->after('advisory_title_snapshot');
        });

        // Existing selections keep today's wording, so edits made after this deploy never rewrite them.
        DB::statement(
            'UPDATE reports SET '
            .'advisory_title_snapshot = (SELECT title FROM advisories WHERE advisories.id = reports.advisory_id), '
            .'advisory_content_snapshot = (SELECT content FROM advisories WHERE advisories.id = reports.advisory_id) '
            .'WHERE advisory_id IS NOT NULL'
        );
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->dropColumn(['advisory_title_snapshot', 'advisory_content_snapshot']);
        });

        Schema::table('advisories', function (Blueprint $table): void {
            $table->dropSoftDeletes();
            $table->dropColumn('category');
        });
    }
};
