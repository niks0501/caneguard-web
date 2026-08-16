<?php

namespace Tests\Feature;

use App\Actions\Reports\PersistReport;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Mockery;
use PDOException;
use RuntimeException;
use Tests\TestCase;

class MobileReportUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_upload_is_transactional_and_idempotent_by_reporter_and_client_uuid(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('mobile-upload-test')->plainTextToken;
        $clientUuid = fake()->uuid();

        $first = $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid));

        $first
            ->assertCreated()
            ->assertJsonPath('data.identity.client_uuid', $clientUuid)
            ->assertJsonPath(
                'data.review.status',
                Report::STATUS_SUBMITTED_UNVERIFIED,
            )
            ->assertJsonPath(
                'data.timestamps.captured_at',
                '2026-07-20T02:00:00.456000Z',
            )
            ->assertJsonCount(3, 'data.model.class_scores');

        $report = Report::query()->sole();
        Storage::disk('local')->assertExists($report->image_path);
        $this->assertDatabaseCount('reports', 1);
        $this->assertDatabaseCount('report_class_scores', 3);
        $this->assertDatabaseCount('report_symptoms', 1);
        $this->assertDatabaseCount('report_quality_warnings', 1);
        $this->assertDatabaseHas('reports', [
            'id' => $report->id,
            'captured_at' => '2026-07-20 02:00:00.456',
        ]);

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid))
            ->assertOk()
            ->assertJsonPath('data.identity.uuid', $report->uuid);

        $this->assertDatabaseCount('reports', 1);
        $this->assertCount(1, Storage::disk('local')->allFiles('reports'));
    }

    public function test_upload_persists_and_returns_all_smart_field_report_fields(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('smart-fields-upload-test')->plainTextToken;
        $clientUuid = fake()->uuid();
        $payload = array_merge($this->payload($clientUuid), [
            'sugarcane_variety' => 'PSR 86',
            'crop_age' => '6 months',
            'cane_class' => 'Class A',
            'affected_area_hectares' => '12.50',
            'affected_portion_percent' => '42.75',
            'field_notes' => 'Rust symptoms concentrated on the eastern edge.',
            'mismatch_reported' => true,
            'reporter_suspected_condition' => 'smut',
            'reporter_observation_text' => 'Dark whip-like growths are visible at the tops of several stalks.',
        ]);

        $response = $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $payload);

        $response
            ->assertCreated()
            ->assertJsonPath('data.model.predicted_label', Report::LABEL_RUST)
            ->assertJsonPath('data.review.status', Report::STATUS_SUBMITTED_UNVERIFIED)
            ->assertJsonCount(3, 'data.model.class_scores')
            ->assertJsonPath('data.observations.sugarcane_variety', 'PSR 86')
            ->assertJsonPath('data.observations.crop_age', '6 months')
            ->assertJsonPath('data.observations.cane_class', 'Class A')
            ->assertJsonPath('data.observations.affected_area_hectares', 12.5)
            ->assertJsonPath('data.observations.affected_portion_percent', 42.75)
            ->assertJsonPath(
                'data.observations.field_notes',
                'Rust symptoms concentrated on the eastern edge.',
            )
            ->assertJsonPath('data.reporter_observation.mismatch_reported', true)
            ->assertJsonPath('data.reporter_observation.reporter_suspected_condition', 'smut')
            ->assertJsonPath(
                'data.reporter_observation.reporter_observation_text',
                'Dark whip-like growths are visible at the tops of several stalks.',
            );

        $report = Report::query()->sole();
        $this->assertSame('PSR 86', $report->sugarcane_variety);
        $this->assertSame('6 months', $report->crop_age);
        $this->assertSame('Class A', $report->cane_class);
        $this->assertSame('12.50', $report->affected_area_hectares);
        $this->assertSame('42.75', $report->affected_portion_percent);
        $this->assertSame(
            'Rust symptoms concentrated on the eastern edge.',
            $report->field_notes,
        );
        $this->assertTrue($report->mismatch_reported);
        $this->assertSame('smut', $report->reporter_suspected_condition);
        $this->assertSame(
            'Dark whip-like growths are visible at the tops of several stalks.',
            $report->reporter_observation_text,
        );

        $reviewer = User::factory()->reviewer()->create();
        Sanctum::actingAs($reviewer);
        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.observations.sugarcane_variety', 'PSR 86')
            ->assertJsonPath('data.observations.affected_area_hectares', 12.5)
            ->assertJsonPath('data.observations.field_notes', $report->field_notes);
    }

    public function test_upload_persists_an_explicit_no_mismatch_without_reporter_text(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('no-mismatch-upload-test')->plainTextToken;

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', array_merge(
                $this->payload(fake()->uuid()),
                ['mismatch_reported' => 'false'],
            ))
            ->assertCreated()
            ->assertJsonPath('data.reporter_observation.mismatch_reported', false)
            ->assertJsonPath('data.reporter_observation.reporter_suspected_condition', null)
            ->assertJsonPath('data.reporter_observation.reporter_observation_text', null);

        $this->assertDatabaseHas('reports', [
            'mismatch_reported' => false,
            'reporter_suspected_condition' => null,
            'reporter_observation_text' => null,
        ]);
    }

    public function test_upload_allows_a_mismatch_without_a_description(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('mismatch-without-text-test')->plainTextToken;

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', array_merge(
                $this->payload(fake()->uuid()),
                ['mismatch_reported' => true],
            ))
            ->assertCreated()
            ->assertJsonPath('data.reporter_observation.mismatch_reported', true)
            ->assertJsonPath('data.reporter_observation.reporter_observation_text', null);
    }

    public function test_upload_persists_mobile_field_report_context_and_separates_observed_from_submitted_timestamps(): void
    {
        Storage::fake('local');
        $serverNow = CarbonImmutable::parse('2026-07-20T06:30:00.123Z');
        CarbonImmutable::setTestNow($serverNow);
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('field-report-contract-test')->plainTextToken;
        $clientUuid = fake()->uuid();
        $scanRecordClientUuid = fake()->uuid();
        $payload = array_merge($this->payload($clientUuid), [
            'scan_record_client_uuid' => $scanRecordClientUuid,
            'farmer_or_farm_owner_name' => 'Juan Dela Cruz',
            'province' => 'Negros Occidental',
            'municipality' => 'Bago',
            'final_latitude' => '10.1234567',
            'final_longitude' => '122.9876543',
            'location_source' => 'gps',
            'gps_accuracy' => '4.25',
            'observed_at' => '2026-07-19T14:20:30.789+08:00',
            'submitted_at' => '2000-01-01T00:00:00.000Z',
        ]);

        try {
            $response = $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', $payload);

            $response
                ->assertCreated()
                ->assertJsonPath(
                    'data.identity.scan_record_client_uuid',
                    $scanRecordClientUuid,
                )
                ->assertJsonPath(
                    'data.observations.farmer_or_farm_owner_name',
                    'Juan Dela Cruz',
                )
                ->assertJsonPath('data.observations.province', 'Negros Occidental')
                ->assertJsonPath('data.observations.municipality', 'Bago')
                ->assertJsonPath('data.observations.final_latitude', 10.1234567)
                ->assertJsonPath('data.observations.final_longitude', 122.9876543)
                ->assertJsonPath('data.observations.location_source', 'gps')
                ->assertJsonPath('data.observations.gps_accuracy', 4.25)
                ->assertJsonPath(
                    'data.timestamps.observed_at',
                    '2026-07-19T06:20:30.789000Z',
                )
                ->assertJsonPath(
                    'data.timestamps.submitted_at',
                    '2026-07-20T06:30:00.123000Z',
                );

            $report = Report::query()->sole();
            $this->assertSame($scanRecordClientUuid, $report->scan_record_client_uuid);
            $this->assertSame('Juan Dela Cruz', $report->farmer_or_farm_owner_name);
            $this->assertSame('Negros Occidental', $report->province);
            $this->assertSame('Bago', $report->municipality);
            $this->assertSame('10.1234567', $report->final_latitude);
            $this->assertSame('122.9876543', $report->final_longitude);
            $this->assertSame('gps', $report->location_source);
            $this->assertSame('4.25', $report->gps_accuracy);
            $this->assertSame(
                '2026-07-19T06:20:30.789000Z',
                $report->observed_at->utc()->toISOString(),
            );
            $this->assertSame(
                $serverNow->toISOString(),
                $report->submitted_at->utc()->toISOString(),
            );
            $this->assertNotSame(
                $report->observed_at->toISOString(),
                $report->submitted_at->toISOString(),
            );

            Sanctum::actingAs(User::factory()->reviewer()->create());
            $this->getJson("/api/v1/reports/{$report->uuid}")
                ->assertOk()
                ->assertJsonPath(
                    'data.identity.scan_record_client_uuid',
                    $scanRecordClientUuid,
                )
                ->assertJsonPath(
                    'data.timestamps.observed_at',
                    '2026-07-19T06:20:30.789000Z',
                );
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_upload_without_smart_fields_remains_backward_compatible(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('legacy-upload-test')->plainTextToken;
        $clientUuid = fake()->uuid();

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid))
            ->assertCreated()
            ->assertJsonPath('data.observations.sugarcane_variety', null)
            ->assertJsonPath('data.observations.crop_age', null)
            ->assertJsonPath('data.observations.cane_class', null)
            ->assertJsonPath('data.observations.affected_area_hectares', null)
            ->assertJsonPath('data.observations.affected_portion_percent', null)
            ->assertJsonPath('data.observations.field_notes', null)
            ->assertJsonPath('data.reporter_observation.mismatch_reported', null)
            ->assertJsonPath('data.reporter_observation.reporter_suspected_condition', null)
            ->assertJsonPath('data.reporter_observation.reporter_observation_text', null)
            ->assertJsonPath('data.observations.farmer_or_farm_owner_name', null)
            ->assertJsonPath('data.observations.province', null)
            ->assertJsonPath('data.observations.municipality', null)
            ->assertJsonPath('data.observations.final_latitude', null)
            ->assertJsonPath('data.observations.final_longitude', null)
            ->assertJsonPath('data.observations.location_source', null)
            ->assertJsonPath('data.observations.gps_accuracy', null)
            ->assertJsonPath('data.timestamps.observed_at', null)
            ->assertJsonPath('data.identity.scan_record_client_uuid', null);

        $this->assertDatabaseHas('reports', [
            'client_uuid' => $clientUuid,
            'sugarcane_variety' => null,
            'crop_age' => null,
            'cane_class' => null,
            'affected_area_hectares' => null,
            'affected_portion_percent' => null,
            'field_notes' => null,
            'mismatch_reported' => null,
            'reporter_suspected_condition' => null,
            'reporter_observation_text' => null,
            'farmer_or_farm_owner_name' => null,
            'province' => null,
            'municipality' => null,
            'final_latitude' => null,
            'final_longitude' => null,
            'location_source' => null,
            'gps_accuracy' => null,
            'observed_at' => null,
            'scan_record_client_uuid' => null,
        ]);
    }

    public function test_upload_accepts_zero_and_one_hundred_percent_boundaries(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('portion-boundaries-test')->plainTextToken;

        foreach ([0, 100] as $portion) {
            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', array_merge(
                    $this->payload(fake()->uuid()),
                    ['affected_portion_percent' => $portion],
                ))
                ->assertCreated()
                ->assertJsonPath(
                    'data.observations.affected_portion_percent',
                    $portion,
                );
        }

        $this->assertDatabaseCount('reports', 2);
    }

    public function test_upload_rejects_invalid_smart_field_numeric_ranges_and_types(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('smart-fields-validation-test')->plainTextToken;

        foreach ([0, -1] as $area) {
            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', array_merge(
                    $this->payload(fake()->uuid()),
                    ['affected_area_hectares' => $area],
                ))
                ->assertUnprocessable()
                ->assertJsonValidationErrors('affected_area_hectares');
        }

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', array_merge(
                $this->payload(fake()->uuid()),
                ['affected_portion_percent' => 100.01],
            ))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('affected_portion_percent');

        foreach ([
            'affected_area_hectares' => 'not-a-number',
            'affected_portion_percent' => 'not-a-number',
        ] as $field => $value) {
            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', array_merge(
                    $this->payload(fake()->uuid()),
                    [$field => $value],
                ))
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }

        $this->assertDatabaseCount('reports', 0);
    }

    public function test_upload_rejects_smart_field_strings_over_their_limits(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('smart-fields-length-test')->plainTextToken;

        foreach ([
            'sugarcane_variety' => str_repeat('v', 101),
            'crop_age' => str_repeat('a', 101),
            'cane_class' => str_repeat('c', 101),
            'field_notes' => str_repeat('n', 5001),
            'reporter_suspected_condition' => str_repeat('s', 121),
            'reporter_observation_text' => str_repeat('o', 1001),
        ] as $field => $value) {
            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', array_merge(
                    $this->payload(fake()->uuid()),
                    [$field => $value],
                ))
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }

        $this->assertDatabaseCount('reports', 0);
    }

    public function test_upload_rejects_invalid_mismatch_and_model_taxonomy_values(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('mismatch-validation-test')->plainTextToken;

        foreach ([
            [['mismatch_reported' => 'sometimes'], 'mismatch_reported'],
            [['predicted_label' => 'other'], 'predicted_label'],
            [[
                'class_scores' => [
                    'healthy' => 0.08,
                    'mosaic' => 0.10,
                    'rust' => 0.72,
                    'other' => 0.10,
                ],
            ], 'class_scores'],
            [['symptom_keys' => ['other']], 'symptom_keys.0'],
        ] as [$fields, $errorField]) {
            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', array_merge(
                    $this->payload(fake()->uuid()),
                    $fields,
                ))
                ->assertUnprocessable()
                ->assertJsonValidationErrors($errorField);
        }

        $this->assertDatabaseCount('reports', 0);
    }

    public function test_upload_normalizes_absent_null_and_empty_smart_fields_to_null(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('smart-fields-null-test')->plainTextToken;
        $fields = [
            'sugarcane_variety',
            'crop_age',
            'cane_class',
            'affected_area_hectares',
            'affected_portion_percent',
            'field_notes',
            'mismatch_reported',
            'reporter_suspected_condition',
            'reporter_observation_text',
        ];

        foreach (['absent', 'null', 'empty'] as $variant) {
            $clientUuid = fake()->uuid();
            $payload = $this->payload($clientUuid);
            if ($variant === 'null') {
                $payload = array_merge($payload, array_fill_keys($fields, null));
            } elseif ($variant === 'empty') {
                $payload = array_merge($payload, array_fill_keys($fields, ''));
            }

            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', $payload)
                ->assertCreated();

            $report = Report::query()->where('client_uuid', $clientUuid)->sole();
            foreach ($fields as $field) {
                $this->assertNull($report->{$field}, "Expected {$field} to be null for {$variant} input.");
            }
        }

        $this->assertDatabaseCount('reports', 3);
    }

    public function test_upload_validates_mobile_location_boundaries_and_cross_field_rules(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('location-validation-test')->plainTextToken;

        foreach ([
            ['final_latitude' => -90, 'final_longitude' => -180],
            ['final_latitude' => 90, 'final_longitude' => 180],
        ] as $location) {
            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', array_merge(
                    $this->payload(fake()->uuid()),
                    [...$location, 'location_source' => 'manual_map'],
                ))
                ->assertCreated();
        }

        foreach ([
            [['final_latitude' => -90.01], 'final_latitude'],
            [['final_longitude' => 180.01], 'final_longitude'],
            [['location_source' => 'device'], 'location_source'],
            [
                [
                    'final_latitude' => 10,
                    'final_longitude' => 120,
                    'location_source' => 'gps',
                    'gps_accuracy' => -0.01,
                ],
                'gps_accuracy',
            ],
            [
                [
                    'final_latitude' => 10,
                    'final_longitude' => 120,
                    'location_source' => 'gps',
                ],
                'gps_accuracy',
            ],
            [
                [
                    'final_latitude' => 10,
                    'final_longitude' => 120,
                    'location_source' => 'manual_map',
                    'gps_accuracy' => 4,
                ],
                'gps_accuracy',
            ],
            [
                ['location_source' => 'gps', 'gps_accuracy' => 4],
                'final_latitude',
            ],
            [['gps_accuracy' => 4], 'gps_accuracy'],
            [['final_latitude' => 10], 'final_longitude'],
        ] as [$fields, $errorField]) {
            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', array_merge(
                    $this->payload(fake()->uuid()),
                    $fields,
                ))
                ->assertUnprocessable()
                ->assertJsonValidationErrors($errorField);
        }

        $this->assertDatabaseCount('reports', 2);
    }

    public function test_original_required_upload_fields_remain_required(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('required-fields-test')->plainTextToken;
        $requiredFields = [
            'client_uuid',
            'image',
            'image_source_type',
            'predicted_label',
            'confidence',
            'class_scores',
            'symptom_keys',
            'checklist_consistency',
            'barangay',
            'model_version',
            'preprocess_ms',
            'inference_ms',
            'total_ms',
            'captured_at',
        ];

        foreach ($requiredFields as $field) {
            $payload = $this->payload(fake()->uuid());
            unset($payload[$field]);

            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', $payload)
                ->assertUnprocessable()
                ->assertJsonValidationErrors($field);
        }

        $this->assertDatabaseCount('reports', 0);
    }

    public function test_same_client_uuid_is_scoped_to_the_reporter(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $otherReporter = User::factory()->fieldReporter()->create();
        $clientUuid = fake()->uuid();
        $firstToken = $reporter->createToken('owner-one')->plainTextToken;
        $secondToken = $otherReporter->createToken('owner-two')->plainTextToken;

        $first = $this->withToken($firstToken)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid));
        $first->assertCreated();
        $first->assertJsonPath('data.identity.uuid', fn (string $uuid) => $uuid !== '');
        $firstReportUuid = $first->json('data.identity.uuid');
        Auth::forgetGuards();
        $second = $this->withToken($secondToken)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid));
        $second->assertCreated();
        $second->assertJsonPath('data.identity.uuid', fn (string $uuid) => $uuid !== $firstReportUuid);

        $this->assertDatabaseCount('reports', 2);
        $this->assertDatabaseHas('reports', [
            'reporter_id' => $reporter->getKey(),
            'client_uuid' => $clientUuid,
        ]);
        $this->assertDatabaseHas('reports', [
            'reporter_id' => $otherReporter->getKey(),
            'client_uuid' => $clientUuid,
        ]);
    }

    public function test_idempotent_resubmission_preserves_existing_review_snapshot_and_version(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('review-preservation-test')->plainTextToken;
        $clientUuid = fake()->uuid();
        $reviewer = User::factory()->reviewer()->create();
        $reviewedAt = now()->subMinute()->setMicrosecond(123000);
        $report = Report::factory()->create([
            'reporter_id' => $reporter,
            'client_uuid' => $clientUuid,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'review_notes' => 'Keep this current snapshot.',
            'reviewer_id' => $reviewer,
            'reviewed_at' => $reviewedAt,
            'lock_version' => 4,
        ]);
        $imagePath = 'reports/existing-review.png';
        Storage::disk('local')->put($imagePath, 'existing-image');
        $report->update(['image_path' => $imagePath]);
        $before = $report->fresh();

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid))
            ->assertOk()
            ->assertJsonPath('data.identity.uuid', $before->uuid)
            ->assertJsonPath('data.identity.client_uuid', $clientUuid)
            ->assertJsonPath('data.review.status', $before->review_status)
            ->assertJsonPath('data.review.notes', $before->review_notes)
            ->assertJsonPath('data.review.reviewer.uuid', $reviewer->uuid)
            ->assertJsonPath('data.version', $before->lock_version);

        $after = $report->fresh();
        $this->assertSame($before->uuid, $after->uuid);
        $this->assertSame($before->review_status, $after->review_status);
        $this->assertSame($before->review_notes, $after->review_notes);
        $this->assertSame($before->reviewer_id, $after->reviewer_id);
        $this->assertSame(
            $before->reviewed_at?->toISOString(),
            $after->reviewed_at?->toISOString(),
        );
        $this->assertSame($before->lock_version, $after->lock_version);
        Storage::disk('local')->assertExists($imagePath);
        $this->assertCount(1, Storage::disk('local')->allFiles('reports'));
    }

    public function test_upload_ignores_spoofed_reporter_and_reviewer_fields(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $spoofedReporter = User::factory()->fieldReporter()->create();
        $spoofedReviewer = User::factory()->reviewer()->create();
        $token = $reporter->createToken('spoofed-identity-test')->plainTextToken;
        $clientUuid = fake()->uuid();

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', array_merge(
                $this->payload($clientUuid),
                [
                    'reporter_id' => $spoofedReporter->getKey(),
                    'reviewer_id' => $spoofedReviewer->getKey(),
                    'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
                ],
            ))
            ->assertCreated()
            ->assertJsonPath('data.reporter.uuid', $reporter->uuid);

        $this->assertDatabaseHas('reports', [
            'client_uuid' => $clientUuid,
            'reporter_id' => $reporter->getKey(),
            'reviewer_id' => null,
            'authority_classified_condition' => null,
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
        ]);
        $this->assertDatabaseMissing('reports', [
            'client_uuid' => $clientUuid,
            'reporter_id' => $spoofedReporter->getKey(),
        ]);
    }

    public function test_upload_rejects_reviewer_role(): void
    {
        Storage::fake('local');
        $reviewer = User::factory()->reviewer()->create();
        $token = $reviewer
            ->createToken('reviewer-upload-test')
            ->plainTextToken;

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload(fake()->uuid()))
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        $this->assertDatabaseCount('reports', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_upload_rejects_admin_role(): void
    {
        Storage::fake('local');
        $admin = User::factory()->admin()->create();
        $token = $admin->createToken('admin-upload-test')->plainTextToken;

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload(fake()->uuid()))
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        $this->assertDatabaseCount('reports', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_status_feed_rejects_a_submit_only_token_even_for_an_owner(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        Report::factory()->create(['reporter_id' => $reporter]);
        $token = $reporter
            ->createToken('submit-only-status-audit', ['report:submit'])
            ->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_upload_requires_report_submit_token_ability(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter
            ->createToken('status-only', ['report:status'])
            ->plainTextToken;

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload(fake()->uuid()))
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        $this->assertDatabaseCount('reports', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_upload_rejects_invalid_payloads(): void
    {
        Storage::fake('local');
        $fieldReporter = User::factory()->fieldReporter()->create();
        $fieldToken = $fieldReporter
            ->createToken('invalid-upload-test')
            ->plainTextToken;
        $payload = $this->payload(fake()->uuid());
        $payload['class_scores'] = ['healthy' => 0.5];

        $this->withToken($fieldToken)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $payload)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR')
            ->assertJsonValidationErrors('class_scores');

        $this->assertDatabaseCount('reports', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_upload_accepts_an_omitted_empty_quality_warnings_array(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter
            ->createToken('empty-quality-warnings-test')
            ->plainTextToken;
        $payload = $this->payload(fake()->uuid());
        unset($payload['quality_warnings']);

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $payload)
            ->assertCreated();

        $this->assertDatabaseCount('reports', 1);
        $this->assertDatabaseCount('report_quality_warnings', 0);
    }

    public function test_image_is_deleted_when_database_creation_fails(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('rollback-test')->plainTextToken;
        Event::listen(
            'eloquent.created: '.Report::class,
            function (): never {
                throw new RuntimeException('Forced database failure.');
            },
        );

        $this->withoutExceptionHandling();

        try {
            $this->withToken($token)
                ->post('/api/v1/mobile/reports', $this->payload(fake()->uuid()));
            $this->fail('The forced report failure should escape the request.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Forced database failure.', $exception->getMessage());
        } finally {
            Event::forget('eloquent.created: '.Report::class);
        }

        $this->assertDatabaseCount('reports', 0);
        $this->assertDatabaseCount('report_class_scores', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_competing_insert_returns_the_winning_idempotent_report(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('race-recovery-test')->plainTextToken;
        $clientUuid = fake()->uuid();
        $winningReport = null;
        $persistence = Mockery::mock(PersistReport::class);
        $persistence->shouldReceive('handle')
            ->once()
            ->andReturnUsing(function (
                User $persistedReporter,
                array $data,
            ) use (&$winningReport): never {
                $winningReport = Report::factory()->create([
                    'reporter_id' => $persistedReporter,
                    'client_uuid' => $data['client_uuid'],
                ]);

                throw new UniqueConstraintViolationException(
                    'sqlite',
                    'insert into reports',
                    [],
                    new PDOException('Unique reporter/client UUID.', 23000),
                );
            });
        $this->app->instance(PersistReport::class, $persistence);

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid))
            ->assertOk()
            ->assertJsonPath('data.identity.uuid', fn (string $uuid) => $uuid
                === $winningReport?->uuid);

        $this->assertDatabaseCount('reports', 1);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_cleanup_failure_is_logged_without_masking_database_failure(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('cleanup-failure-test')->plainTextToken;
        $disk = Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('putFileAs')
            ->once()
            ->andReturn('reports/forced-cleanup.png');
        $disk->shouldReceive('delete')
            ->once()
            ->with('reports/forced-cleanup.png')
            ->andReturn(false);
        Storage::shouldReceive('disk')
            ->with('local')
            ->twice()
            ->andReturn($disk);
        Log::spy();
        Event::listen(
            'eloquent.created: '.Report::class,
            function (): never {
                throw new RuntimeException('Original database failure.');
            },
        );
        $this->withoutExceptionHandling();

        try {
            $this->withToken($token)
                ->post('/api/v1/mobile/reports', $this->payload(fake()->uuid()));
            $this->fail('The forced report failure should escape the request.');
        } catch (RuntimeException $exception) {
            $this->assertSame(
                'Original database failure.',
                $exception->getMessage(),
            );
        } finally {
            Event::forget('eloquent.created: '.Report::class);
        }

        Log::shouldHaveReceived('critical')
            ->once()
            ->withArgs(fn (string $message, array $context) => $message
                === 'Failed report upload left an orphaned image.'
                && $context['image_path'] === 'reports/forced-cleanup.png'
                && $context['failure_type'] === RuntimeException::class);
        $this->assertDatabaseCount('reports', 0);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $clientUuid): array
    {
        $image = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            strict: true,
        );

        return [
            'client_uuid' => $clientUuid,
            'image' => UploadedFile::fake()->createWithContent('leaf.png', $image),
            'image_source_type' => 'camera',
            'source_width' => 1,
            'source_height' => 1,
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.82,
            'class_scores' => [
                'healthy' => 0.08,
                'mosaic' => 0.10,
                'rust' => 0.82,
            ],
            'symptom_keys' => ['rust'],
            'checklist_consistency' => 'consistent',
            'reported_severity' => 'moderate',
            'quality_warnings' => ['low-resolution'],
            'barangay' => 'Mabini',
            'model_version' => 'caneguard-mobile-v1.0.0',
            'preprocess_ms' => 12.5,
            'inference_ms' => 95.75,
            'total_ms' => 122.25,
            'captured_at' => '2026-07-20T10:00:00.456+08:00',
        ];
    }
}
