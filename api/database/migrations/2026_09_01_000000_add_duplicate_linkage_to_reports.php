<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->foreignId('canonical_report_id')
                ->nullable()
                ->after('lock_version')
                ->constrained('reports')
                ->nullOnDelete();

            $table->index(['canonical_report_id', 'submitted_at']);
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->dropForeign(['canonical_report_id']);
            $table->dropIndex(['canonical_report_id', 'submitted_at']);
            $table->dropColumn('canonical_report_id');
        });
    }
};
