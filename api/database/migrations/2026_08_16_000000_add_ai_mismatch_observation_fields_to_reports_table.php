<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->boolean('mismatch_reported')
                ->nullable()
                ->after('field_notes');
            $table->string('reporter_suspected_condition', 120)
                ->nullable()
                ->after('mismatch_reported');
            $table->text('reporter_observation_text')
                ->nullable()
                ->after('reporter_suspected_condition');
            $table->string('authority_classified_condition', 40)
                ->nullable()
                ->after('review_notes');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropColumn([
                'mismatch_reported',
                'reporter_suspected_condition',
                'reporter_observation_text',
                'authority_classified_condition',
            ]);
        });
    }
};
