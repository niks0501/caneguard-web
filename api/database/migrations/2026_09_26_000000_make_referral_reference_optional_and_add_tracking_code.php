<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('report_referrals', function (Blueprint $table): void {
            // Existing external references remain untouched; newer handoffs may
            // not receive an office memo or letter number until later.
            $table->string('reference', 160)->nullable()->change();
            $table->string('tracking_code', 32)->nullable()->unique();
        });
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
