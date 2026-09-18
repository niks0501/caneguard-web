<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('report_referrals', function (Blueprint $table): void {
            $table->foreignId('expert_id')
                ->nullable()
                ->after('referred_by_id')
                ->constrained('users')
                ->nullOnDelete();
            $table->index(['expert_id', 'consult_status']);
        });
    }

    public function down(): void
    {
        Schema::table('report_referrals', function (Blueprint $table): void {
            $table->dropIndex(['expert_id', 'consult_status']);
            $table->dropForeign(['expert_id']);
            $table->dropColumn('expert_id');
        });
    }
};
