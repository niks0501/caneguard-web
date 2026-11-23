<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A review claim is a short lease, not a lock on the record. It lives in
     * its own columns so claiming and heartbeats never touch `lock_version`
     * and cannot invalidate a draft another reviewer already loaded.
     */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->foreignId('review_claimed_by_id')
                ->nullable()
                ->after('lock_version')
                ->constrained('users')
                ->nullOnDelete();
            $table->dateTime('review_claimed_at', 3)->nullable()->after('review_claimed_by_id');
            $table->dateTime('review_claim_expires_at', 3)->nullable()->after('review_claimed_at');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('review_claimed_by_id');
            $table->dropColumn(['review_claimed_at', 'review_claim_expires_at']);
        });
    }
};
