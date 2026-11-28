<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Normalized barangay target lookup for farmer broadcasts so mobile queries
     * filter by barangay in SQL before applying any row limit.
     */
    public function up(): void
    {
        if (! Schema::hasTable('farmer_advisory_broadcast_barangays')) {
            Schema::create('farmer_advisory_broadcast_barangays', function (Blueprint $table): void {
                $table->foreignId('broadcast_id')
                    ->constrained('farmer_advisory_broadcasts')
                    ->cascadeOnDelete();
                $table->string('barangay', 80);

                $table->primary(['broadcast_id', 'barangay'], 'fab_barangays_pk');
                $table->index(['barangay', 'broadcast_id'], 'fab_barangays_barangay_idx');
            });
        }

        DB::table('farmer_advisory_broadcasts')
            ->select(['id', 'barangays'])
            ->whereNotNull('barangays')
            ->chunkById(100, function ($rows): void {
                $inserts = [];

                foreach ($rows as $row) {
                    $decoded = is_string($row->barangays)
                        ? json_decode($row->barangays, true)
                        : $row->barangays;

                    if (! is_array($decoded)) {
                        continue;
                    }

                    $barangays = array_values(array_unique(array_filter(
                        $decoded,
                        fn (mixed $value): bool => is_string($value) && $value !== '',
                    )));

                    foreach ($barangays as $barangay) {
                        $inserts[] = [
                            'broadcast_id' => $row->id,
                            'barangay' => $barangay,
                        ];
                    }
                }

                if ($inserts !== []) {
                    DB::table('farmer_advisory_broadcast_barangays')->insertOrIgnore($inserts);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('farmer_advisory_broadcast_barangays');
    }
};
