<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The reviewer queue's Follow-Up state is driven by an explicit
     * scheduled-revisit flag rather than an inferred target visit date, so a
     * completed validation only reads as Follow-Up when the office says a
     * revisit is planned.
     */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->boolean('scheduled_revisit')->default(false)->after('first_reviewed_at');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->dropColumn('scheduled_revisit');
        });
    }
};
