<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('advisories', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('code', 64)->unique();
            $table->string('title', 160);
            $table->text('content');
            $table->string('status', 16)->default('draft');
            $table->text('validation_provenance')->nullable();
            $table->foreignId('created_by_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->foreignId('validated_by_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->dateTime('validated_at', precision: 3)->nullable();
            $table->foreignId('retired_by_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->dateTime('retired_at', precision: 3)->nullable();
            $table->timestamps();

            $table->index(['status', 'updated_at']);
        });

        Schema::table('reports', function (Blueprint $table): void {
            $table->foreignId('advisory_id')
                ->nullable()
                ->after('referral_state')
                ->constrained('advisories')
                ->nullOnDelete();
            $table->foreignId('advisory_selected_by_id')
                ->nullable()
                ->after('advisory_id')
                ->constrained('users')
                ->nullOnDelete();
            $table->dateTime('advisory_selected_at', precision: 3)
                ->nullable()
                ->after('advisory_selected_by_id');
            $table->string('advisory_delivery_state', 16)
                ->default('not_selected')
                ->after('advisory_selected_at');
            $table->dateTime('advisory_delivered_at', precision: 3)
                ->nullable()
                ->after('advisory_delivery_state');
            $table->dateTime('advisory_acknowledged_at', precision: 3)
                ->nullable()
                ->after('advisory_delivered_at');

            $table->index(['advisory_id', 'advisory_delivery_state']);
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table): void {
            $table->dropIndex(['advisory_id', 'advisory_delivery_state']);
            $table->dropForeign(['advisory_id']);
            $table->dropForeign(['advisory_selected_by_id']);
            $table->dropColumn([
                'advisory_id',
                'advisory_selected_by_id',
                'advisory_selected_at',
                'advisory_delivery_state',
                'advisory_delivered_at',
                'advisory_acknowledged_at',
            ]);
        });

        Schema::dropIfExists('advisories');
    }
};
