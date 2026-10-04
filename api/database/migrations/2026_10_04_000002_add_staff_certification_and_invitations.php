<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // No role-derived backfill: existing evidence and actors stay intact,
        // but staff authority requires an office-approved roster reference.
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('staff_certified_at')->nullable();
            $table->string('staff_authority_reference')->nullable();
            $table->foreignId('staff_certified_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('staff_invitations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('approved_by')->constrained('users')->restrictOnDelete();
            $table->string('role');
            $table->string('authority_reference');
            $table->string('email_hash', 64);
            $table->string('token_hash', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'accepted_at', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_invitations');
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('staff_certified_by');
            $table->dropColumn(['staff_certified_at', 'staff_authority_reference']);
        });
    }
};
