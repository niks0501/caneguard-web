<?php

use App\Support\MigrationReplay;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        MigrationReplay::create('districts', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name', 160);
            $table->timestamps();
        });
        MigrationReplay::create('district_memberships', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('district_id')->constrained()->restrictOnDelete();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'district_id']);
        });
        MigrationReplay::create('district_grants', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('district_id')->constrained()->restrictOnDelete();
            $table->string('ability', 40);
            $table->unsignedInteger('revision')->default(1);
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'district_id', 'ability']);
        });
        // No inferred backfill: the office must approve record attribution.
        MigrationReplay::column('reports', 'district_id', fn (Blueprint $table) => $table->foreignId('district_id')->nullable());
        MigrationReplay::foreign('reports', 'district_id', 'districts');
        MigrationReplay::index('reports', ['district_id', 'submitted_at'], 'reports_district_id_submitted_at_index');
        // Old credentials must not carry their former unscoped authority forward.
        DB::table('personal_access_tokens')->delete();
        DB::table('sessions')->delete();
        DB::table('users')->update(['remember_token' => null]);
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->dropIndex(['district_id', 'submitted_at']);
            $table->dropConstrainedForeignId('district_id');
        });
        Schema::dropIfExists('district_grants');
        Schema::dropIfExists('district_memberships');
        Schema::dropIfExists('districts');
        // Revoked credentials are deliberately never restored.
    }
};
