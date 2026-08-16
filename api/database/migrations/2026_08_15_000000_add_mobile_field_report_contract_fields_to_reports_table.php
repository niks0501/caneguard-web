<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->string('farmer_or_farm_owner_name', 160)
                ->nullable()
                ->after('field_notes');
            $table->string('province', 120)
                ->nullable()
                ->after('farmer_or_farm_owner_name');
            $table->string('municipality', 120)
                ->nullable()
                ->after('province');
            $table->decimal('final_latitude', 10, 7)
                ->nullable()
                ->after('municipality');
            $table->decimal('final_longitude', 10, 7)
                ->nullable()
                ->after('final_latitude');
            $table->string('location_source', 20)
                ->nullable()
                ->after('final_longitude');
            $table->decimal('gps_accuracy', 10, 2)
                ->nullable()
                ->after('location_source');
            $table->dateTime('observed_at', precision: 3)
                ->nullable()
                ->after('captured_at');
            $table->uuid('scan_record_client_uuid')
                ->nullable()
                ->after('client_uuid');
            $table->index('scan_record_client_uuid');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropIndex(['scan_record_client_uuid']);
            $table->dropColumn([
                'farmer_or_farm_owner_name',
                'province',
                'municipality',
                'final_latitude',
                'final_longitude',
                'location_source',
                'gps_accuracy',
                'observed_at',
                'scan_record_client_uuid',
            ]);
        });
    }
};
