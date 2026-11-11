<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('report_aerial_analyses', function (Blueprint $table): void {
            $table->uuid('removal_id')->nullable()->after('removed_by');
        });
    }

    public function down(): void
    {
        Schema::table('report_aerial_analyses', function (Blueprint $table): void {
            $table->dropColumn('removal_id');
        });
    }
};
