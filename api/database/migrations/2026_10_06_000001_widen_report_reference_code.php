<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Deployment namespaces add 18 characters to existing demo references.
        // Keep those stable identities and the existing unique index intact.
        Schema::table('reports', function (Blueprint $table): void {
            $table->string('reference_code', 64)->change();
        });
    }

    public function down(): void
    {
        $length = DB::connection()->getDriverName() === 'sqlite' ? 'LENGTH' : 'CHAR_LENGTH';
        if (DB::table('reports')->whereRaw($length.'(reference_code) > 32')->exists()) {
            throw new RuntimeException('Report references exceed 32 characters; retain the wider column and use approved forward recovery.');
        }

        Schema::table('reports', function (Blueprint $table): void {
            $table->string('reference_code', 32)->change();
        });
    }
};
