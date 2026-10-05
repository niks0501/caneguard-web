<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Never choose a legacy approver or silently reconcile contradictory authority.
        if (DB::table('district_grants')->select('district_id')->where('ability', 'report:approve')->whereNull('revoked_at')
            ->groupBy('district_id')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('Multiple active report approvers require approved operator reconciliation before migration.');
        }
        Schema::table('users', function (Blueprint $table): void {
            $table->unsignedBigInteger('access_version')->default(1);
            $table->string('registration_origin', 32)->default('unknown');
            $table->index(['created_at', 'id']);
        });
        Schema::table('district_grants', function (Blueprint $table): void {
            $table->unsignedBigInteger('active_approver_district')->nullable()
                ->storedAs("CASE WHEN ability = 'report:approve' AND revoked_at IS NULL THEN district_id ELSE NULL END");
            $table->unique('active_approver_district');
        });
        Schema::create('account_reviews', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->string('disposition', 32);
            $table->string('office_reference', 160);
            $table->timestamps();
        });
        Schema::create('account_access_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('operation_id')->index();
            $table->foreignId('district_id')->constrained()->restrictOnDelete();
            $table->foreignId('target_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('contract_version', 40);
            $table->string('action', 32);
            $table->string('office_reference', 160);
            $table->json('actor_snapshot');
            $table->json('before');
            $table->json('after');
            $table->timestamp('occurred_at');
            $table->index(['target_id', 'occurred_at', 'id']);
            $table->index(['district_id', 'occurred_at', 'id']);
        });
        Schema::create('account_access_receipts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('district_id')->constrained()->restrictOnDelete();
            $table->uuid('idempotency_key');
            $table->char('body_hash', 64);
            $table->json('response');
            $table->timestamp('expires_at');
            $table->unique(['actor_id', 'district_id', 'idempotency_key'], 'account_receipt_key');
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Account access evidence and authority revisions must be retained; use an approved forward recovery migration.');
    }
};
