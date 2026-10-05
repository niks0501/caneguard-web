<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function (): void {
            DB::table('report_referrals')
                ->whereIn('consult_status', ['pending', 'in_progress'])
                ->orderBy('id')->eachById(function ($referral): void {
                    DB::table('report_audits')->insert([
                        'report_id' => $referral->report_id,
                        'actor_id' => $referral->referred_by_id,
                        'field' => 'historical_consult_'.$referral->id.'_status',
                        'original_value' => json_encode($referral->consult_status),
                        'corrected_value' => json_encode('cancelled'),
                        'reason' => 'In-system expert workflow retired automatically; original handoff author retained for attribution',
                        'created_at' => now(),
                    ]);
                    DB::table('report_referrals')->where('id', $referral->id)
                        ->update(['consult_status' => 'cancelled']);
                });
            DB::table('report_referrals')->whereNotNull('invite_token_hash')
                ->whereNull('invite_revoked_at')->update(['invite_revoked_at' => now()]);
            // Preserve all account references and historical authorship; do not convert to office roles.
            DB::table('users')->where('role', 'expert')->update(['role' => 'disabled']);
        });
    }

    public function down(): void
    {
        // Retirement is deliberately irreversible: never reactivate access or consults on rollback.
        // Historical tables and columns are retained, with no data deletion or schema drops.
    }
};
