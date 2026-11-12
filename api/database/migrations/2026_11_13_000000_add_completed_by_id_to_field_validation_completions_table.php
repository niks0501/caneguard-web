<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('field_validation_completions', 'completed_by_id')) {
            return;
        }

        Schema::table('field_validation_completions', function (Blueprint $table): void {
            $table->foreignId('completed_by_id')->nullable()->after('assignment_id')
                ->constrained('users')->nullOnDelete();
        });

        // Best known completer for existing rows: the assignee of record.
        DB::table('field_validation_completions')->update([
            'completed_by_id' => DB::table('field_validation_assignments')
                ->select('assignee_id')
                ->whereColumn('field_validation_assignments.id', 'field_validation_completions.assignment_id'),
        ]);
    }

    public function down(): void
    {
        if (! Schema::hasColumn('field_validation_completions', 'completed_by_id')) {
            return;
        }

        Schema::table('field_validation_completions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('completed_by_id');
        });
    }
};
