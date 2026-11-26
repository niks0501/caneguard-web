<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A farmer's opt-in "ask the office to look". Kept apart from `reports`
     * on purpose: nothing here is a surveillance record, and no query behind
     * the dashboard, map or weekly reports reads these tables.
     */
    public function up(): void
    {
        Schema::create('farmer_inquiries', function (Blueprint $table): void {
            $table->id();
            $table->uuid()->unique();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            // Stable key minted by the phone so a retried upload never duplicates.
            $table->uuid('client_uuid');
            // The first scan of a Check Again chain: one live request per chain.
            $table->uuid('scan_chain_uuid')->nullable();
            $table->string('barangay', 80);
            $table->string('landmark', 120)->nullable();
            $table->string('concern', 40)->nullable();
            $table->string('note', 500)->nullable();
            // What the farmer's own on-device scan said. An unverified hint only.
            $table->string('ai_label', 40)->nullable();
            $table->unsignedTinyInteger('ai_confidence_percent')->nullable();
            $table->string('status', 16)->default('new');
            $table->unsignedInteger('lock_version')->default(1);
            $table->foreignId('reviewed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reviewed_at', 3)->nullable();
            $table->dateTime('replied_at', 3)->nullable();
            $table->timestamps(3);

            $table->unique(['user_id', 'client_uuid']);
            $table->index(['status', 'created_at']);
            $table->index(['barangay', 'status']);
            $table->index(['user_id', 'scan_chain_uuid']);
        });

        Schema::create('farmer_inquiry_photos', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('farmer_inquiry_id')->constrained('farmer_inquiries')->cascadeOnDelete();
            $table->unsignedTinyInteger('position');
            $table->string('path');
            $table->string('mime_type', 40);
            $table->unsignedInteger('size_bytes');
            $table->timestamps(3);

            $table->unique(['farmer_inquiry_id', 'position']);
        });

        Schema::create('farmer_inquiry_replies', function (Blueprint $table): void {
            $table->id();
            $table->uuid()->unique();
            $table->foreignId('farmer_inquiry_id')->constrained('farmer_inquiries')->cascadeOnDelete();
            $table->foreignId('author_id')->constrained('users')->restrictOnDelete();
            $table->string('kind', 16);
            $table->foreignId('advisory_id')->nullable()->constrained('advisories')->nullOnDelete();
            // Frozen copy so a retired advisory never rewrites what the farmer was told.
            $table->string('advisory_title')->nullable();
            $table->text('body');
            $table->timestamps(3);

            $table->index(['farmer_inquiry_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('farmer_inquiry_replies');
        Schema::dropIfExists('farmer_inquiry_photos');
        Schema::dropIfExists('farmer_inquiries');
    }
};
