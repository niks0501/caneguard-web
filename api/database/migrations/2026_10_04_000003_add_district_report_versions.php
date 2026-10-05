<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('district_recipient_sets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('district_id')->constrained()->restrictOnDelete();
            $table->json('recipients');
            $table->string('office_reference', 160);
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });
        Schema::create('district_report_versions', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('district_id')->constrained()->restrictOnDelete();
            $table->date('week_start');
            $table->unsignedInteger('version');
            $table->char('content_hash', 64);
            $table->json('content');
            $table->json('source_refs');
            $table->foreignId('prepared_by_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('approved_by_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('approved_grant_id')->nullable()->constrained('district_grants')->restrictOnDelete();
            $table->unsignedInteger('approved_grant_revision')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
            $table->unique(['district_id', 'week_start', 'version'], 'district_week_version_unique');
        });
        Schema::create('district_report_transmissions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('district_report_version_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('district_recipient_set_id')->constrained()->restrictOnDelete();
            $table->foreignId('requested_by_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('send_grant_id')->constrained('district_grants')->restrictOnDelete();
            $table->unsignedInteger('send_grant_revision');
            $table->uuid('idempotency_key')->unique();
            $table->string('state', 30)->default('pending');
            $table->string('transport_receipt', 160)->nullable();
            $table->timestamps();
        });
        Schema::create('district_report_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('district_report_version_id')->constrained()->restrictOnDelete();
            $table->foreignId('district_id')->constrained()->restrictOnDelete();
            $table->date('week_start');
            $table->char('content_hash', 64);
            $table->string('action', 30);
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->uuid('actor_uuid');
            $table->string('actor_role', 30);
            $table->foreignId('grant_id')->nullable()->constrained('district_grants')->restrictOnDelete();
            $table->unsignedInteger('grant_revision')->nullable();
            $table->foreignId('recipient_set_id')->nullable()->constrained('district_recipient_sets')->restrictOnDelete();
            $table->uuid('idempotency_key')->nullable();
            $table->timestamp('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('district_report_events');
        Schema::dropIfExists('district_report_transmissions');
        Schema::dropIfExists('district_report_versions');
        Schema::dropIfExists('district_recipient_sets');
    }
};
