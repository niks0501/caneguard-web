<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->string('case_state', 16)
                ->default('open')
                ->after('review_status');
            $table->string('verification_outcome', 32)
                ->default('not_determined')
                ->after('case_state');
            $table->string('field_validation_state', 32)
                ->default('unassigned')
                ->after('verification_outcome');
            $table->string('referral_state', 32)
                ->default('not_referred')
                ->after('field_validation_state');

            $table->index(['case_state', 'submitted_at']);
            $table->index(['field_validation_state', 'submitted_at']);
        });

        // Keep this historical mapping in the migration so a future change to
        // the model's compatibility rules cannot rewrite old records.
        $legacyLifecycle = [
            'submitted_unverified' => [
                'case_state' => 'open',
                'verification_outcome' => 'not_determined',
                'field_validation_state' => 'unassigned',
                'referral_state' => 'not_referred',
            ],
            'for_field_validation' => [
                'case_state' => 'open',
                'verification_outcome' => 'not_determined',
                'field_validation_state' => 'unassigned',
                'referral_state' => 'not_referred',
            ],
            'verified_by_staff' => [
                'case_state' => 'closed',
                'verification_outcome' => 'verified',
                'field_validation_state' => 'unassigned',
                'referral_state' => 'not_referred',
            ],
            'unable_to_verify' => [
                'case_state' => 'closed',
                'verification_outcome' => 'unable_to_verify',
                'field_validation_state' => 'unassigned',
                'referral_state' => 'not_referred',
            ],
            'resolved' => [
                'case_state' => 'closed',
                'verification_outcome' => 'not_determined',
                'field_validation_state' => 'unassigned',
                'referral_state' => 'not_referred',
            ],
        ];

        foreach ($legacyLifecycle as $reviewStatus => $lifecycle) {
            DB::table('reports')
                ->where('review_status', $reviewStatus)
                ->update($lifecycle);
        }

        // An unexpected legacy value must not manufacture an open work item.
        DB::table('reports')
            ->whereNotIn('review_status', array_keys($legacyLifecycle))
            ->update([
                'case_state' => 'closed',
                'verification_outcome' => 'not_determined',
                'field_validation_state' => 'unassigned',
                'referral_state' => 'not_referred',
            ]);
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropIndex(['case_state', 'submitted_at']);
            $table->dropIndex(['field_validation_state', 'submitted_at']);
            $table->dropColumn([
                'case_state',
                'verification_outcome',
                'field_validation_state',
                'referral_state',
            ]);
        });
    }
};
