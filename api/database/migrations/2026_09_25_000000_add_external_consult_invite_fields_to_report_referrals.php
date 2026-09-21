<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('report_referrals', function (Blueprint $table): void {
            $table->string('invite_token_hash', 64)->nullable()->unique()->after('expert_contact');
            $table->dateTime('invite_issued_at', precision: 3)->nullable()->after('invite_token_hash');
            $table->dateTime('invite_expires_at', precision: 3)->nullable()->after('invite_issued_at');
            $table->dateTime('invite_revoked_at', precision: 3)->nullable()->after('invite_expires_at');
            $table->unsignedInteger('invite_access_count')->default(0)->after('invite_revoked_at');
            $table->dateTime('invite_first_accessed_at', precision: 3)->nullable()->after('invite_access_count');
            $table->dateTime('invite_last_accessed_at', precision: 3)->nullable()->after('invite_first_accessed_at');
            $table->boolean('share_full_context')->default(false)->after('invite_last_accessed_at');
            $table->index(['invite_expires_at', 'invite_revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::table('report_referrals', function (Blueprint $table): void {
            $table->dropIndex(['invite_expires_at', 'invite_revoked_at']);
            $table->dropUnique(['invite_token_hash']);
            $table->dropColumn([
                'invite_token_hash',
                'invite_issued_at',
                'invite_expires_at',
                'invite_revoked_at',
                'invite_access_count',
                'invite_first_accessed_at',
                'invite_last_accessed_at',
                'share_full_context',
            ]);
        });
    }
};
