<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Admin-controlled runtime switches. A missing row means off.
        Schema::create('feature_switches', function (Blueprint $table): void {
            $table->string('name', 80)->primary();
            $table->boolean('enabled')->default(false);
            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feature_switches');
    }
};
