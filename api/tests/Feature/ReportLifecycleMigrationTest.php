<?php

namespace Tests\Feature;

use Carbon\CarbonImmutable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ReportLifecycleMigrationTest extends TestCase
{
    public function test_lifecycle_migration_maps_legacy_records_without_losing_evidence(): void
    {
        $connectionName = 'lifecycle_migration_sqlite';
        $originalDefault = config('database.default');
        $migration = null;
        $migrated = false;
        $schema = null;

        config([
            'database.default' => $connectionName,
            "database.connections.{$connectionName}" => [
                'driver' => 'sqlite',
                'database' => ':memory:',
                'prefix' => '',
                'foreign_key_constraints' => false,
            ],
        ]);
        DB::purge($connectionName);

        try {
            $schema = Schema::connection($connectionName);
            $schema->create('reports', function (Blueprint $table): void {
                $table->id();
                $table->uuid('uuid');
                $table->string('reference_code', 32);
                $table->unsignedBigInteger('reporter_id');
                $table->unsignedBigInteger('reviewer_id')->nullable();
                $table->string('barangay', 120);
                $table->uuid('client_uuid');
                $table->uuid('scan_record_client_uuid')->nullable();
                $table->string('image_path', 500);
                $table->string('predicted_label', 32);
                $table->decimal('confidence', 8, 7);
                $table->dateTime('captured_at', precision: 3);
                $table->dateTime('submitted_at', precision: 3);
                $table->string('review_status', 40);
                $table->text('review_notes')->nullable();
                $table->string('authority_classified_condition', 40)->nullable();
                $table->dateTime('reviewed_at', precision: 3)->nullable();
            });

            $legacyRecords = [
                [
                    'uuid' => '10000000-0000-4000-8000-000000000001',
                    'reference_code' => 'CG-LEGACY-0001',
                    'reporter_id' => 101,
                    'reviewer_id' => null,
                    'barangay' => 'Mabini',
                    'client_uuid' => '11000000-0000-4000-8000-000000000001',
                    'scan_record_client_uuid' => '12000000-0000-4000-8000-000000000001',
                    'review_status' => 'submitted_unverified',
                    'review_notes' => null,
                    'authority_classified_condition' => null,
                    'reviewed_at' => null,
                ],
                [
                    'uuid' => '10000000-0000-4000-8000-000000000002',
                    'reference_code' => 'CG-LEGACY-0002',
                    'reporter_id' => 102,
                    'reviewer_id' => 201,
                    'barangay' => 'San Isidro',
                    'client_uuid' => '11000000-0000-4000-8000-000000000002',
                    'scan_record_client_uuid' => null,
                    'review_status' => 'for_field_validation',
                    'review_notes' => 'Visit the field site.',
                    'authority_classified_condition' => null,
                    'reviewed_at' => '2026-08-21 09:00:00.000',
                ],
                [
                    'uuid' => '10000000-0000-4000-8000-000000000003',
                    'reference_code' => 'CG-LEGACY-0003',
                    'reporter_id' => 103,
                    'reviewer_id' => 201,
                    'barangay' => 'Poblacion',
                    'client_uuid' => '11000000-0000-4000-8000-000000000003',
                    'scan_record_client_uuid' => '12000000-0000-4000-8000-000000000003',
                    'review_status' => 'verified_by_staff',
                    'review_notes' => 'Verified against the submitted evidence.',
                    'authority_classified_condition' => 'smut',
                    'reviewed_at' => '2026-08-21 10:00:00.000',
                ],
                [
                    'uuid' => '10000000-0000-4000-8000-000000000004',
                    'reference_code' => 'CG-LEGACY-0004',
                    'reporter_id' => 104,
                    'reviewer_id' => 201,
                    'barangay' => 'San Roque',
                    'client_uuid' => '11000000-0000-4000-8000-000000000004',
                    'scan_record_client_uuid' => null,
                    'review_status' => 'unable_to_verify',
                    'review_notes' => 'The image is inconclusive.',
                    'authority_classified_condition' => 'unable_to_classify',
                    'reviewed_at' => '2026-08-21 11:00:00.000',
                ],
                [
                    'uuid' => '10000000-0000-4000-8000-000000000005',
                    'reference_code' => 'CG-LEGACY-0005',
                    'reporter_id' => 105,
                    'reviewer_id' => 201,
                    'barangay' => 'Mabini',
                    'client_uuid' => '11000000-0000-4000-8000-000000000005',
                    'scan_record_client_uuid' => '12000000-0000-4000-8000-000000000005',
                    'review_status' => 'resolved',
                    'review_notes' => 'Historical office resolution.',
                    'authority_classified_condition' => null,
                    'reviewed_at' => '2026-08-21 12:00:00.000',
                ],
            ];
            $capturedAt = CarbonImmutable::parse('2026-08-20T08:00:00.000Z');
            $submittedAt = CarbonImmutable::parse('2026-08-20T09:00:00.000Z');

            foreach ($legacyRecords as $index => $record) {
                DB::connection($connectionName)->table('reports')->insert([
                    ...$record,
                    'image_path' => "reports/legacy-{$index}.jpg",
                    'predicted_label' => 'rust',
                    'confidence' => 0.8123456,
                    'captured_at' => $capturedAt->format('Y-m-d H:i:s.v'),
                    'submitted_at' => $submittedAt->format('Y-m-d H:i:s.v'),
                ]);
            }

            $before = DB::connection($connectionName)
                ->table('reports')
                ->get()
                ->keyBy('uuid')
                ->map(fn (object $record): array => [
                    'reference_code' => $record->reference_code,
                    'reporter_id' => $record->reporter_id,
                    'reviewer_id' => $record->reviewer_id,
                    'barangay' => $record->barangay,
                    'client_uuid' => $record->client_uuid,
                    'scan_record_client_uuid' => $record->scan_record_client_uuid,
                    'image_path' => $record->image_path,
                    'predicted_label' => $record->predicted_label,
                    'confidence' => $record->confidence,
                    'captured_at' => $record->captured_at,
                    'submitted_at' => $record->submitted_at,
                    'review_status' => $record->review_status,
                    'review_notes' => $record->review_notes,
                    'authority_classified_condition' => $record->authority_classified_condition,
                    'reviewed_at' => $record->reviewed_at,
                ]);

            $migration = require database_path(
                'migrations/2026_08_28_000000_add_report_lifecycle_dimensions.php',
            );
            $migration->up();
            $migrated = true;

            $this->assertTrue($schema->hasColumns('reports', [
                'case_state',
                'verification_outcome',
                'field_validation_state',
                'referral_state',
            ]));

            $expectedLifecycle = [
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

            $after = DB::connection($connectionName)
                ->table('reports')
                ->get()
                ->keyBy('uuid');

            foreach ($before as $uuid => $original) {
                $migratedRecord = $after->get($uuid);
                $this->assertNotNull($migratedRecord);

                foreach ($original as $field => $value) {
                    $this->assertSame(
                        $value,
                        $migratedRecord->{$field},
                        "Changed {$field} for {$uuid}.",
                    );
                }

                $this->assertSame(
                    $expectedLifecycle[$migratedRecord->review_status],
                    [
                        'case_state' => $migratedRecord->case_state,
                        'verification_outcome' => $migratedRecord->verification_outcome,
                        'field_validation_state' => $migratedRecord->field_validation_state,
                        'referral_state' => $migratedRecord->referral_state,
                    ],
                );
            }
        } finally {
            if (
                $migrated
                && $migration !== null
                && $schema !== null
                && $schema->hasColumn('reports', 'case_state')
            ) {
                $migration->down();
            }

            Schema::connection($connectionName)->dropIfExists('reports');
            DB::purge($connectionName);
            config(['database.default' => $originalDefault]);
        }
    }
}
