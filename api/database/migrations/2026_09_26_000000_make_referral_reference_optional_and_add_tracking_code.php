<?php

use App\Support\MigrationReplay;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Repeating the nullable change is safe; it does not modify reference values.
        Schema::table('report_referrals', fn (Blueprint $table) => $table->string('reference', 160)->nullable()->change());
        MigrationReplay::column('report_referrals', 'tracking_code', fn (Blueprint $table) => $table->string('tracking_code', 32)->nullable());
        MigrationReplay::index('report_referrals', ['tracking_code'], 'report_referrals_tracking_code_unique', true);
    }

    public function down(): void
    {
        Schema::table('report_referrals', function (Blueprint $table): void {
            $table->dropUnique(['tracking_code']);
            $table->dropColumn('tracking_code');
        });

        // Keep reference nullable: rows created after this migration may have
        // no external reference, so restoring the old constraint would be unsafe.
    }
};
