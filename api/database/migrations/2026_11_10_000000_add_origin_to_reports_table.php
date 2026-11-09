<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Marks where a case was born. Phone uploads keep the `mobile` default;
     * seeders and imports write `office` so phones know there is no local twin.
     */
    public function up(): void
    {
        if (Schema::hasColumn('reports', 'origin')) {
            return;
        }

        Schema::table('reports', function (Blueprint $table): void {
            $table->string('origin', 16)->default('mobile')->after('uuid');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('reports', 'origin')) {
            return;
        }

        Schema::table('reports', function (Blueprint $table): void {
            $table->dropColumn('origin');
        });
    }
};
