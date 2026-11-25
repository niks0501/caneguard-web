<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The office no longer types a loss rate: the phone's measured share of the
     * plot is shown instead. Stored values stay as history.
     */
    public function up(): void
    {
        Schema::table('report_affected_field_surveys', function (Blueprint $table): void {
            $table->decimal('loss_rate_percent', 5, 2)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('report_affected_field_surveys', function (Blueprint $table): void {
            $table->decimal('loss_rate_percent', 5, 2)->nullable(false)->default(0)->change();
        });
    }
};
