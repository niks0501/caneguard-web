<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->index('observed_at');
            $table->index([
                'review_status',
                'observed_at',
                'submitted_at',
                'id',
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropIndex(['review_status', 'observed_at', 'submitted_at', 'id']);
            $table->dropIndex(['observed_at']);
        });
    }
};
