<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A farmer's coarse home barangay and reading language. Both are optional
     * and additive: older clients and every other role simply leave them null.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('barangay', 80)->nullable()->after('role');
            $table->string('preferred_language', 2)->nullable()->after('barangay');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['barangay', 'preferred_language']);
        });
    }
};
