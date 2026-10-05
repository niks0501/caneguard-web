<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('district_report_versions', function (Blueprint $table): void {
            $table->foreignId('supersedes_version_id')->nullable()->constrained('district_report_versions')->restrictOnDelete();
            $table->string('version_reason', 30)->default('initial');
            $table->string('prepared_name')->nullable();
            $table->string('approved_name')->nullable();
            $table->string('approved_title')->nullable();
            $table->char('document_sha256', 64)->nullable();
            $table->string('renderer_version', 80)->nullable();
            // Immutable approval-time bytes, base64 encoded for database portability.
            $table->longText('document_bytes')->nullable();
        });
        Schema::table('district_report_transmissions', function (Blueprint $table): void {
            // MySQL must retain an index for the existing foreign key.
            $table->index('district_report_version_id', 'district_transmission_version_index');
            $table->dropUnique(['district_report_version_id']);
            $table->string('requested_name')->nullable();
            $table->string('failure_reason', 160)->nullable();
            $table->timestamp('completed_at')->nullable();
        });
        Schema::create('district_reporting_settings', function (Blueprint $table): void {
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
