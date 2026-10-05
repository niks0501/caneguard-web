<?php

use App\Support\MigrationReplay;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        MigrationReplay::column('district_report_versions', 'supersedes_version_id', fn (Blueprint $table) => $table->foreignId('supersedes_version_id')->nullable());
        MigrationReplay::foreign('district_report_versions', 'supersedes_version_id', 'district_report_versions');
        MigrationReplay::column('district_report_versions', 'version_reason', fn (Blueprint $table) => $table->string('version_reason', 30)->default('initial'));
        MigrationReplay::column('district_report_versions', 'prepared_name', fn (Blueprint $table) => $table->string('prepared_name')->nullable());
        MigrationReplay::column('district_report_versions', 'approved_name', fn (Blueprint $table) => $table->string('approved_name')->nullable());
        MigrationReplay::column('district_report_versions', 'approved_title', fn (Blueprint $table) => $table->string('approved_title')->nullable());
        MigrationReplay::column('district_report_versions', 'document_sha256', fn (Blueprint $table) => $table->char('document_sha256', 64)->nullable());
        MigrationReplay::column('district_report_versions', 'renderer_version', fn (Blueprint $table) => $table->string('renderer_version', 80)->nullable());
        // Immutable approval-time bytes, base64 encoded for database portability.
        MigrationReplay::column('district_report_versions', 'document_bytes', fn (Blueprint $table) => $table->longText('document_bytes')->nullable());

        // Retain an index for the FK before dropping uniqueness, also on replay.
        MigrationReplay::index('district_report_transmissions', ['district_report_version_id'], 'district_transmission_version_index');
        MigrationReplay::dropIndex('district_report_transmissions', 'district_report_transmissions_district_report_version_id_unique');
        MigrationReplay::column('district_report_transmissions', 'requested_name', fn (Blueprint $table) => $table->string('requested_name')->nullable());
        MigrationReplay::column('district_report_transmissions', 'failure_reason', fn (Blueprint $table) => $table->string('failure_reason', 160)->nullable());
        MigrationReplay::column('district_report_transmissions', 'completed_at', fn (Blueprint $table) => $table->timestamp('completed_at')->nullable());
        MigrationReplay::create('district_reporting_settings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('district_id')->unique()->constrained()->restrictOnDelete();
            $table->unsignedTinyInteger('reminder_day')->default(1);
            $table->string('reminder_time', 5)->default('09:00');
            $table->string('office_reference', 160);
            $table->foreignId('updated_by_id')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('district_reporting_settings');
        Schema::table('district_report_transmissions', function (Blueprint $table): void {
            $table->dropColumn(['requested_name', 'failure_reason', 'completed_at']);
            $table->unique('district_report_version_id');
            $table->dropIndex('district_transmission_version_index');
        });
        Schema::table('district_report_versions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('supersedes_version_id');
            $table->dropColumn(['version_reason', 'prepared_name', 'approved_name', 'approved_title', 'document_sha256', 'renderer_version', 'document_bytes']);
        });
    }
};
