<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('district_report_versions', function (Blueprint $table): void {
            $table->foreignId('prepared_by_id')->nullable()->change();
            $table->string('prepared_source', 20)->default('manual')->after('prepared_by_id');
        });

        Schema::table('district_report_events', function (Blueprint $table): void {
            $table->foreignId('actor_id')->nullable()->change();
            $table->uuid('actor_uuid')->nullable()->change();
        });

        Schema::create('district_rssi_report_versions', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('district_id')->constrained()->restrictOnDelete();
            $table->date('week_start');
            $table->unsignedInteger('version');
            $table->char('content_hash', 64);
            $table->json('content');
            $table->json('source_refs');
            $table->string('prepared_source', 20)->default('manual');
            $table->foreignId('prepared_by_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('prepared_name')->nullable();
            $table->foreignId('supersedes_version_id')->nullable()->constrained('district_rssi_report_versions')->restrictOnDelete();
            $table->string('version_reason', 30)->default('initial');
            $table->char('pdf_sha256', 64);
            // Base64-encoded immutable A4 PDF bytes for database portability.
            $table->longText('pdf_bytes');
            $table->char('csv_sha256', 64);
            $table->longText('csv_content');
            $table->string('renderer_version', 80)->nullable();
            $table->timestamps();
            $table->unique(['district_id', 'week_start', 'version'], 'district_rssi_week_version_unique');
        });

        Schema::table('district_reporting_settings', function (Blueprint $table): void {
            $table->unsignedTinyInteger('reminder_day')->nullable()->default(null)->change();
            $table->string('reminder_time', 5)->nullable()->default(null)->change();
            $table->string('office_reference', 160)->nullable()->change();
            $table->foreignId('updated_by_id')->nullable()->change();
            $table->boolean('auto_generate_enabled')->default(true)->after('reminder_time');
            $table->unsignedTinyInteger('auto_generate_day')->default(1)->after('auto_generate_enabled');
            $table->string('auto_generate_time', 5)->default('06:00')->after('auto_generate_day');
            $table->timestamp('last_auto_generated_at')->nullable()->after('auto_generate_time');
            $table->string('last_auto_status', 20)->nullable()->after('last_auto_generated_at');
            $table->string('last_auto_week', 10)->nullable()->after('last_auto_status');
            $table->string('last_auto_error', 240)->nullable()->after('last_auto_week');
        });

        // Retire any pending in-app email delivery intents without deleting historical rows.
        DB::table('district_report_transmissions')
            ->where('state', 'pending')
            ->update([
                'state' => 'cancelled',
                'failure_reason' => 'In-system report email delivery was retired.',
                'completed_at' => now()->utc(),
                'updated_at' => now()->utc(),
            ]);
    }

    public function down(): void
    {
        Schema::table('district_reporting_settings', function (Blueprint $table): void {
            $table->dropColumn([
                'auto_generate_enabled',
                'auto_generate_day',
                'auto_generate_time',
                'last_auto_generated_at',
                'last_auto_status',
                'last_auto_week',
                'last_auto_error',
            ]);
        });

        Schema::dropIfExists('district_rssi_report_versions');

        Schema::table('district_report_events', function (Blueprint $table): void {
            $table->foreignId('actor_id')->nullable(false)->change();
            $table->uuid('actor_uuid')->nullable(false)->change();
        });

        Schema::table('district_report_versions', function (Blueprint $table): void {
            $table->dropColumn('prepared_source');
            $table->foreignId('prepared_by_id')->nullable(false)->change();
        });
    }
};
