<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('field_validation_completions', function (Blueprint $table): void {
            $table->string('follow_up_outcome', 32)->nullable()->after('action_taken');
        });
    }

    public function down(): void
    {
        Schema::table('field_validation_completions', function (Blueprint $table): void {
            $table->dropColumn('follow_up_outcome');
        });
    }
};
