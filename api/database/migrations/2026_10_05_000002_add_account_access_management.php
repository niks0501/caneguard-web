<?php

use App\Support\MigrationReplay;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Never choose a legacy approver or silently reconcile contradictory authority.
        if (DB::table('district_grants')->select('district_id')->where('ability', 'report:approve')->whereNull('revoked_at')
            ->groupBy('district_id')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('Multiple active report approvers require approved operator reconciliation before migration.');
        }
        MigrationReplay::column('users', 'access_version', fn (Blueprint $table) => $table->unsignedBigInteger('access_version')->default(1));
        MigrationReplay::column('users', 'registration_origin', fn (Blueprint $table) => $table->string('registration_origin', 32)->default('unknown'));
        MigrationReplay::index('users', ['created_at', 'id'], 'users_created_at_id_index');
        MigrationReplay::column('district_grants', 'active_approver_district', fn (Blueprint $table) => $table->unsignedBigInteger('active_approver_district')->nullable()
            ->storedAs("CASE WHEN ability = 'report:approve' AND revoked_at IS NULL THEN district_id ELSE NULL END"));
        MigrationReplay::index('district_grants', ['active_approver_district'], 'district_grants_active_approver_district_unique', true);
        MigrationReplay::create('account_reviews', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->string('disposition', 32);
            $table->string('office_reference', 160);
            $table->timestamps();
        });
        MigrationReplay::create('account_access_events', function (Blueprint $table): void {
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
        MigrationReplay::create('account_access_receipts', function (Blueprint $table): void {
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
