<?php

use App\Models\SecurityAudit;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('onboarded_at')->nullable();
        });

        $passwordSet = DB::table('security_audits')
            ->whereNotNull('target_user_id')
            ->where('outcome', SecurityAudit::OUTCOME_SUCCESS)
            ->whereIn('action', [SecurityAudit::ACTION_PASSWORD_RESET, SecurityAudit::ACTION_PASSWORD_CHANGE])
            ->select('target_user_id');

        DB::table('users')
            ->where(fn ($query) => $query->whereNotNull('email_verified_at')
                ->orWhereIn('id', $passwordSet))
            ->update(['onboarded_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('onboarded_at');
        });
    }
};
