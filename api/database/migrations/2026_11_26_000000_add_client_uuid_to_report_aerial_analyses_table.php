<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('report_aerial_analyses', function (Blueprint $table): void {
            $table->uuid('client_uuid')->nullable()->after('uuid');
            $table->unique(['report_id', 'client_uuid']);
        });
    }

    public function down(): void
    {
        Schema::table('report_aerial_analyses', function (Blueprint $table): void {
            $table->dropUnique(['report_id', 'client_uuid']);
            $table->dropColumn('client_uuid');
        });
    }
};
