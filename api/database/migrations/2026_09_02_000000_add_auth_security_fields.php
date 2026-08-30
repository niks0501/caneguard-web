<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('biometric_enabled')->default(false)->after('email_verified_at');
        });

        Schema::table('personal_access_tokens', function (Blueprint $table): void {
            $table->string('device_id', 191)->nullable()->after('name');
            $table->index(['tokenable_type', 'tokenable_id', 'device_id']);
        });
    }

    public function down(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table): void {
            $table->dropIndex(['personal_access_tokens_tokenable_type_tokenable_id_device_id_index']);
            $table->dropColumn('device_id');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('biometric_enabled');
        });
    }
};
