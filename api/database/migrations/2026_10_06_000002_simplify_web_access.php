<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('is_active')->default(true);
            $table->unsignedBigInteger('auth_version')->default(1);
        });
        // Legacy grant evidence remains readable; new role-based sends have no grant.
        Schema::table('district_report_transmissions', function (Blueprint $table): void {
            $table->unsignedBigInteger('send_grant_id')->nullable()->change();
            $table->unsignedInteger('send_grant_revision')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['is_active', 'auth_version']));
        // Do not make historical role-based transmissions invalid on rollback.
    }
};
