<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Office guidance published to farmers by coarse barangay. A broadcast is
     * always built on a validated advisory and carries no farmer identity,
     * location pin or neighbour information.
     */
    public function up(): void
    {
        Schema::create('farmer_advisory_broadcasts', function (Blueprint $table): void {
            $table->id();
            $table->uuid()->unique();
            $table->foreignId('advisory_id')->constrained('advisories')->restrictOnDelete();
            $table->string('headline_tl', 160);
            $table->string('headline_en', 160);
            $table->text('body_tl');
            $table->text('body_en');
            // Null reaches every barangay; otherwise a list of Nasugbu barangay names.
            $table->json('barangays')->nullable();
            $table->foreignId('published_by_id')->constrained('users')->restrictOnDelete();
            $table->dateTime('published_at', 3);
            $table->dateTime('expires_at', 3);
            $table->foreignId('retired_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('retired_at', 3)->nullable();
            $table->timestamps(3);

            $table->index(['expires_at', 'retired_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('farmer_advisory_broadcasts');
    }
};
