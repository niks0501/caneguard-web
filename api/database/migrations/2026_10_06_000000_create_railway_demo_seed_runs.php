<?php

use App\Support\MigrationReplay;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;

return new class extends Migration
{
    public function up(): void
    {
        // Receipt only: migrating never creates demo data or launch authority.
        MigrationReplay::create('railway_demo_seed_runs', function (Blueprint $table): void {
            $table->string('id', 80)->primary();
            $table->foreignId('district_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('manager_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('report_count')->default(0);
            $table->timestamp('completed_at')->nullable();
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Retain the demo seed receipt to prevent accidental reseeding; use approved forward recovery.');
    }
};
