<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The phone's walked-field measure travels with a report by the survey's
     * client uuid. The uuid is the link rather than a foreign key because the
     * survey and the report are uploaded independently and may arrive in
     * either order.
     */
    public function up(): void
    {
        if (Schema::hasColumn('reports', 'field_survey_client_uuid')) {
            return;
        }

        Schema::table('reports', function (Blueprint $table): void {
            $table->uuid('field_survey_client_uuid')
                ->nullable()
                ->after('scan_record_client_uuid');
            $table->index('field_survey_client_uuid');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('reports', 'field_survey_client_uuid')) {
            return;
        }

        Schema::table('reports', function (Blueprint $table): void {
            $table->dropIndex(['field_survey_client_uuid']);
            $table->dropColumn('field_survey_client_uuid');
        });
    }
};
