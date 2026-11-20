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

        // Fail closed: any existing account with verification, a reset or verification record, or a credential
        // revocation is treated as onboarded, because its history cannot prove the holder never set a password.
        $onboardingAudits = DB::table('security_audits')
            ->whereNotNull('target_user_id')
            ->whereIn('action', [SecurityAudit::ACTION_PASSWORD_RESET, SecurityAudit::ACTION_EMAIL_VERIFICATION])
            ->select('target_user_id');

        DB::table('users')
            ->where(fn ($query) => $query->whereNotNull('email_verified_at')
                ->orWhere('auth_version', '!=', 1)
                ->orWhereIn('id', $onboardingAudits))
            ->update(['onboarded_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('onboarded_at');
        });
    }
};
