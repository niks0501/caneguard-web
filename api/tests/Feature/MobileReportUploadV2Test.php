<?php

namespace Tests\Feature;

use App\Contracts\MobileReportUploadV2Contract;
use App\Models\Report;
use App\Models\ReportAudit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileReportUploadV2Test extends TestCase
{
    use RefreshDatabase;

    public function test_v2_accepts_and_persists_a_smut_model_v1_report(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-upload-test', ['report:submit'])->plainTextToken;
        $clientUuid = fake()->uuid();

        $response = $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid));

        $response
            ->assertCreated()
            ->assertJsonPath('data.review.status', Report::STATUS_SUBMITTED_UNVERIFIED)
            ->assertJsonPath('data.model.predicted_label', Report::LABEL_SMUT)
            ->assertJsonPath('data.model.model_version', 'v1.0-mobilenetv2')
            ->assertJsonCount(4, 'data.model.class_scores')
            ->assertJsonPath('data.observations.symptom_keys.0', Report::LABEL_SMUT)
            ->assertJsonPath(
                'data.reporter_observation.reporter_observation_text',
                'Dark whip-like growths are visible.',
            );

        $report = Report::query()->where('client_uuid', $clientUuid)->sole();
        $this->assertSame(Report::LABEL_SMUT, $report->predicted_label);
        $this->assertSame('v1.0-mobilenetv2', $report->model_version);
        $this->assertSame(
            [
                'healthy' => 0.01,
                'mosaic' => 0.01,
                'rust' => 0.01,
                'smut' => 0.97,
            ],
            $report->classScores()
                ->pluck('score', 'label')
                ->map(fn (string $score): float => (float) $score)
                ->all(),
        );
        $this->assertSame(['smut'], $report->symptoms()->pluck('symptom_key')->all());
        $this->assertSame(
            'Dark whip-like growths are visible.',
            $report->reporter_observation_text,
        );
        $this->assertNull($report->canonical_report_id);
        $this->assertSame(Report::STATUS_SUBMITTED_UNVERIFIED, $report->review_status);
        Storage::disk('local')->assertExists($report->image_path);

        $this->withoutToken();
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());
        $this->getJson('/api/v1/reports?'.http_build_query([
            'search' => $report->reference_code,
        ]))
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.uuid', $report->uuid)
            ->assertJsonPath('data.0.review_status', Report::STATUS_SUBMITTED_UNVERIFIED);
    }

    public function test_v2_preserves_rssi_reporter_observation_without_changing_model_v1_evidence(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-rssi-upload-test', ['report:submit'])->plainTextToken;
        $clientUuid = fake()->uuid();

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid, [
                'predicted_label' => Report::LABEL_RUST,
                'confidence' => 0.82,
                'class_scores' => [
                    'healthy' => 0.05,
                    'mosaic' => 0.13,
                    'rust' => 0.82,
                    'smut' => 0,
                ],
                'symptom_keys' => [Report::LABEL_RUST],
                'mismatch_reported' => '1',
                'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
                'reporter_observation_text' => 'RSSI concern observed in the field.',
            ]))
            ->assertCreated()
            ->assertJsonPath('data.reporter_observation.mismatch_reported', true)
            ->assertJsonPath(
                'data.reporter_observation.reporter_suspected_condition',
                Report::REPORTER_CONCERN_RSSI,
            )
            ->assertJsonPath(
                'data.reporter_observation.reporter_observation_text',
                'RSSI concern observed in the field.',
            )
            ->assertJsonPath('data.model.predicted_label', Report::LABEL_RUST)
            ->assertJsonPath('data.model.model_version', 'v1.0-mobilenetv2')
            ->assertJsonCount(4, 'data.model.class_scores');

        $report = Report::query()->where('client_uuid', $clientUuid)->sole();
        $this->assertSame(Report::REPORTER_CONCERN_RSSI, $report->reporter_suspected_condition);
        $this->assertSame('RSSI concern observed in the field.', $report->reporter_observation_text);
        $this->assertSame(Report::LABEL_RUST, $report->predicted_label);
        $this->assertSame(0.82, (float) $report->confidence);
        $this->assertSame(
            ['healthy' => 0.05, 'mosaic' => 0.13, 'rust' => 0.82, 'smut' => 0.0],
            $report->classScores()
                ->pluck('score', 'label')
                ->map(fn (string $score): float => (float) $score)
                ->all(),
        );
    }

    public function test_v2_rejects_rssi_and_legacy_downy_mildew_as_ai_predictions(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-class-boundary-test', ['report:submit'])->plainTextToken;

        foreach (['RSSI', 'rssi', 'downy_mildew'] as $unsupportedPrediction) {
            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v2/mobile/reports', $this->payload(fake()->uuid(), [
                    'predicted_label' => $unsupportedPrediction,
                ]))
                ->assertUnprocessable()
                ->assertJsonValidationErrors('predicted_label');
        }

        $this->assertDatabaseCount('reports', 0);
    }

    public function test_v2_retry_omits_reviewer_and_audit_identity(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create([
            'email' => 'reviewer-private@example.test',
            'name' => 'Private reviewer name',
        ]);
        $clientUuid = fake()->uuid();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->mobileModelV1()->create([
            'reporter_id' => $reporter,
            'client_uuid' => $clientUuid,
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'review_notes' => 'Verified by office staff.',
            'reviewer_id' => $reviewer,
            'reviewed_at' => now()->subMinute(),
        ]);
        ReportAudit::query()->create([
            'report_id' => $report->id,
            'actor_id' => $reviewer->id,
            'field' => 'field_notes',
            'original_value' => 'Original note.',
            'corrected_value' => 'Corrected note.',
            'reason' => 'Office correction.',
            'created_at' => now()->subMinute(),
        ]);
        $token = $reporter->createToken('mobile-v2-private-retry', ['report:submit'])->plainTextToken;

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid))
            ->assertOk()
            ->assertJsonPath('data.identity.uuid', $report->uuid)
            ->assertJsonPath('data.review.status', Report::STATUS_VERIFIED_BY_STAFF)
            ->assertJsonMissingPath('data.reporter.email')
            ->assertJsonMissingPath('data.review.reviewer')
            ->assertJsonMissingPath('data.audit');
    }

    public function test_v2_rejects_incomplete_extra_and_malformed_class_scores(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-invalid-test', ['report:submit'])->plainTextToken;

        foreach ([
            ['healthy' => 0.01, 'mosaic' => 0.01, 'rust' => 0.01],
            ['healthy' => 0.01, 'mosaic' => 0.01, 'rust' => 0.01, 'smut' => 0.97, 'other' => 0],
            ['healthy' => 0.01, 'mosaic' => 0.01, 'rust' => 0.01, 'other' => 0.97],
            ['healthy' => 0.01, 'mosaic' => 0.01, 'rust' => 0.01, 'smut' => 'not-a-number'],
        ] as $classScores) {
            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v2/mobile/reports', $this->payload(
                    fake()->uuid(),
                    ['class_scores' => $classScores],
                ))
                ->assertUnprocessable()
                ->assertJsonPath('code', 'VALIDATION_ERROR')
                ->assertJsonStructure(['errors']);
        }

        $this->assertDatabaseCount('reports', 0);
        $this->assertSame(4, count(MobileReportUploadV2Contract::field('class_scores')['conditions'][0]['required_keys']));
    }

    public function test_v2_status_feed_exposes_a_completed_authority_review_to_mobile(): void
    {
        CarbonImmutable::setTestNow('2026-09-13T10:00:00Z');
        try {
            $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
            $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
            $report = Report::factory()->inDistrict($this->pilotDistrict())->mobileModelV1()->create([
                'reporter_id' => $reporter,
                'predicted_label' => Report::LABEL_SMUT,
            ]);

            $this->actingAs($reviewer, 'web')
                ->patchJson(
                    "/api/v1/reports/{$report->uuid}/review",
                    [
                        'status' => Report::STATUS_RESOLVED,
                        'notes' => 'Smut confirmed by authority review.',
                        'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
                        'expected_version' => 0,
                    ],
                )
                ->assertOk();

            Auth::guard('web')->logout();
            Auth::forgetGuards();
            Auth::shouldUse('web');
            $this->flushHeaders();
            $token = $reporter->createToken('mobile-v2-completed-status', ['report:status'])->plainTextToken;
            $this->withToken($token)
                ->getJson('/api/v2/mobile/reports/statuses?sync_before=2026-09-13T10:00:01Z')
                ->assertOk()
                ->assertJsonPath('data.0.client_uuid', $report->client_uuid)
                ->assertJsonPath('data.0.review_status', Report::STATUS_RESOLVED)
                ->assertJsonPath('data.0.review_notes', 'Smut confirmed by authority review.')
                ->assertJsonPath('data.0.reviewed_at', '2026-09-13T10:00:00.000000Z');
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_v2_status_feed_returns_the_owned_report_status(): void
    {
        CarbonImmutable::setTestNow('2026-09-13T10:00:00Z');
        try {
            $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
            $report = Report::factory()->inDistrict($this->pilotDistrict())->create(['reporter_id' => $reporter]);
            $token = $reporter->createToken('mobile-v2-status-test', ['report:status'])->plainTextToken;

            $this->withToken($token)
                ->getJson('/api/v2/mobile/reports/statuses?sync_before=2026-09-13T10:00:01Z')
                ->assertOk()
                ->assertJsonPath('data.0.uuid', $report->uuid)
                ->assertJsonPath('sync.before', fn (string $value): bool => $value !== '');
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function test_v2_records_explicit_measurement_provenance(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-provenance', ['report:submit'])->plainTextToken;
        $clientUuid = fake()->uuid();

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid, [
                'affected_area_hectares' => 12.5,
                'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
                'affected_portion_measurement' => Report::MEASUREMENT_NOT_MEASURED,
            ]))
            ->assertCreated()
            ->assertJsonPath(
                'data.observations.affected_area_measurement',
                Report::MEASUREMENT_MEASURED,
            )
            ->assertJsonPath(
                'data.observations.affected_portion_measurement',
                Report::MEASUREMENT_NOT_MEASURED,
            )
            ->assertJsonPath('data.observations.affected_portion_percent', null);

        $report = Report::query()->where('client_uuid', $clientUuid)->sole();
        $this->assertSame(Report::MEASUREMENT_MEASURED, $report->affected_area_measurement);
        $this->assertNull($report->affected_portion_percent);
    }

    public function test_v2_infers_measurement_provenance_for_a_legacy_payload(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-inferred', ['report:submit'])->plainTextToken;
        $withValue = fake()->uuid();
        $withoutValue = fake()->uuid();

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($withValue, [
                'affected_area_hectares' => 4.25,
            ]))
            ->assertCreated();

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($withoutValue, [
                'affected_area_hectares' => '',
            ]))
            ->assertCreated();

        $measuredReport = Report::query()->where('client_uuid', $withValue)->sole();
        $this->assertSame(Report::MEASUREMENT_MEASURED, $measuredReport->affected_area_measurement);
        $this->assertSame(Report::MEASUREMENT_NOT_MEASURED, $measuredReport->affected_portion_measurement);

        $notMeasuredReport = Report::query()->where('client_uuid', $withoutValue)->sole();
        $this->assertSame(Report::MEASUREMENT_NOT_MEASURED, $notMeasuredReport->affected_area_measurement);
        $this->assertNull($notMeasuredReport->affected_area_hectares);
    }

    public function test_v2_rejects_incoherent_measurement_provenance(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-invalid', ['report:submit'])->plainTextToken;

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload(fake()->uuid(), [
                'affected_area_measurement' => Report::MEASUREMENT_NOT_MEASURED,
                'affected_area_hectares' => 12.5,
            ]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload(fake()->uuid(), [
                'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
            ]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload(fake()->uuid(), [
                'affected_area_measurement' => 'guessed',
            ]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'VALIDATION_ERROR');
    }

    public function test_v2_accepts_a_deliberately_unavailable_location(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-location', ['report:submit'])->plainTextToken;
        $clientUuid = fake()->uuid();

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid, [
                'barangay' => 'Mabini',
                'location_source' => Report::LOCATION_SOURCE_UNAVAILABLE,
                'location_unavailable_reason' => Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
                // Multipart clients may include empty coordinate parts when no location was captured.
                'final_latitude' => '',
                'final_longitude' => '',
            ]))
            ->assertCreated()
            ->assertJsonPath('data.observations.location_source', Report::LOCATION_SOURCE_UNAVAILABLE)
            ->assertJsonPath('data.observations.location_unavailable', true)
            ->assertJsonPath(
                'data.observations.location_unavailable_reason',
                Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
            )
            ->assertJsonPath('data.observations.final_latitude', null)
            ->assertJsonPath('data.observations.final_longitude', null);

        $report = Report::query()->where('client_uuid', $clientUuid)->sole();
        $this->assertTrue($report->hasLocationUnavailable());
        $this->assertNull($report->final_latitude);
        $this->assertNull($report->final_longitude);
        $this->assertSame(
            Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
            $report->location_unavailable_reason,
        );
        $this->assertSame('Mabini', $report->barangay);
        Auth::forgetGuards();
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $this->withoutToken()->actingAs($reviewer, 'web');
        $this->getJson('/api/v1/reports/map')->assertOk()->assertJsonCount(0, 'features')
            ->assertJsonPath('metadata.unlocated_count', 1);
        $this->getJson('/api/v1/reports/field-validation-queue')->assertOk()->assertJsonPath('data.count', 0);
        // Newly submitted reports enter needs-review, not needs-visit.
        $this->getJson('/api/v1/reports?queue=needs_review')->assertOk()->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.uuid', $report->uuid);
    }

    public function test_v2_rejects_incoherent_location_provenance(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-location-invalid', ['report:submit'])->plainTextToken;

        // An unavailable location still has to say why.
        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload(fake()->uuid(), [
                'location_source' => Report::LOCATION_SOURCE_UNAVAILABLE,
            ]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        // Coordinates contradict an unavailable location.
        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload(fake()->uuid(), [
                'location_source' => Report::LOCATION_SOURCE_UNAVAILABLE,
                'location_unavailable_reason' => Report::LOCATION_UNAVAILABLE_REASON_PERMISSION_DENIED,
                'final_latitude' => 14.05,
                'final_longitude' => 120.9,
            ]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        // A GPS location still requires coordinates.
        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload(fake()->uuid(), [
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 6.5,
            ]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        // A reason without an unavailable location is contradictory.
        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload(fake()->uuid(), [
                'final_latitude' => 14.05,
                'final_longitude' => 120.9,
                'location_source' => Report::LOCATION_SOURCE_GPS,
                'gps_accuracy' => 6.5,
                'location_unavailable_reason' => Report::LOCATION_UNAVAILABLE_REASON_OTHER,
            ]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'VALIDATION_ERROR');
    }

    public function test_v2_persists_future_model_evidence_and_exposes_recognition_without_rejecting_it(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('future-model', ['report:submit'])->plainTextToken;
        $clientUuid = fake()->uuid();
        $scores = ['alpha' => 0.1, 'beta' => 0.2, 'gamma' => 0.3, 'delta' => 0.4, 'new_class' => 0.5];

        $this->withToken($token)->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid, [
                'model_version' => 'v2-future',
                'class_scores' => $scores,
            ]))->assertCreated()->assertJsonPath('data.model.model_version', 'v2-future')
            ->assertJsonCount(5, 'data.model.class_scores');

        $report = Report::query()->where('client_uuid', $clientUuid)->sole();
        ksort($scores);
        $this->assertSame($scores, $report->classScores()->pluck('score', 'label')->map(fn ($value) => (float) $value)->all());
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Auth::forgetGuards();
        $this->withoutToken()->actingAs($reviewer, 'web')
            ->getJson("/api/v1/reports/{$report->uuid}")->assertOk()
            ->assertJsonPath('data.model.model_version_recognised', false)
            ->assertJsonCount(5, 'data.model.class_scores');
        config(['caneguard.accepted_model_versions' => ['v2-future']]);
        $this->getJson("/api/v1/reports/{$report->uuid}")->assertOk()
            ->assertJsonPath('data.model.model_version_recognised', true);
    }

    public function test_v2_future_evidence_still_rejects_malformed_versions_keys_and_scores(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('future-model-invalid', ['report:submit'])->plainTextToken;
        foreach ([
            ['model_version' => ''],
            ['model_version' => str_repeat('x', 101)],
            ['class_scores' => ['a' => 0, 'b' => 0, 'c' => 0]],
            ['class_scores' => ['a' => 0, 'b' => 0, 'c' => 0, 'd' => 1.1]],
            ['class_scores' => ['a' => 0, 'b' => 0, 'c' => 0, 'd' => 'bad']],
            ['class_scores' => ['a' => 0, 'b' => 0, 'c' => 0, 'nested' => ['x' => 1]]],
            ['class_scores' => ['a' => 0, 'b' => 0, 'c' => 0, 'bad.key' => 1]],
            ['class_scores' => ['a' => 0, 'b' => 0, 'c' => 0, str_repeat('x', 33) => 1]],
        ] as $overrides) {
            $this->withToken($token)->withHeader('Accept', 'application/json')
                ->post('/api/v2/mobile/reports', $this->payload(fake()->uuid(), array_replace([
                    'model_version' => 'future',
                ], $overrides)))->assertUnprocessable();
        }
        $this->assertDatabaseCount('reports', 0);
    }

    public function test_v2_every_server_authority_field_is_ignored_on_create_and_reviewed_replay(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('all-authority-spoofs', ['report:submit'])->plainTextToken;
        $definition = MobileReportUploadV2Contract::definition();
        $spoofs = array_fill_keys(array_merge(
            $definition['authority']['server_derived'],
            $definition['authority']['server_owned_read_only'],
            ['district_code', 'location_group_key', 'location_group_size'],
        ), 'spoofed');
        $spoofs['lock_version'] = 9999;
        $spoofs['review_status'] = Report::STATUS_RESOLVED;
        $spoofs['district_id'] = 9999;
        $spoofs['reporter_id'] = 9999;
        $clientUuid = fake()->uuid();
        $this->withToken($token)->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid, $spoofs))
            ->assertCreated()->assertJsonPath('data.review.status', Report::STATUS_SUBMITTED_UNVERIFIED);
        $report = Report::query()->where('client_uuid', $clientUuid)->sole();
        $this->assertSame($reporter->id, $report->reporter_id);
        $this->assertSame($this->pilotDistrict()->id, $report->district_id);
        $this->assertSame(0, $report->lock_version);
        $this->assertNull($report->reviewer_id);
        $this->assertNull($report->review_notes);
        $this->assertNull($report->reviewed_at);
        $this->assertNull($report->authority_classified_condition);
        $this->assertSame(Report::CASE_STATE_OPEN, $report->case_state);
        $this->assertSame(Report::VERIFICATION_OUTCOME_NOT_DETERMINED, $report->verification_outcome);
        $this->assertSame(Report::FIELD_VALIDATION_STATE_UNASSIGNED, $report->field_validation_state);
        $this->assertSame(Report::REFERRAL_STATE_NOT_REFERRED, $report->referral_state);
        $this->assertNotSame('spoofed', $report->uuid);
        $this->assertNotSame('spoofed', $report->reference_code);
        $this->assertSame('image/png', $report->image_mime_type);
        $this->assertGreaterThan(0, $report->image_size_bytes);
        foreach (['submitted_at', 'created_at', 'updated_at'] as $field) {
            $this->assertNotNull($report->{$field});
        }

        $report->update([
            'review_status' => Report::STATUS_UNABLE_TO_VERIFY,
            'review_notes' => 'Rejected evidence; new UUID required for a new submission.',
            'reviewed_at' => now(),
            'lock_version' => 7,
        ]);
        $before = $report->fresh()->getAttributes();
        $this->withToken($token)->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid, $spoofs))
            ->assertOk()->assertJsonPath('data.identity.uuid', $report->uuid)
            ->assertJsonPath('data.review.status', Report::STATUS_UNABLE_TO_VERIFY);
        $this->assertSame($before, $report->fresh()->getAttributes());
        $this->assertDatabaseCount('reports', 1);
        $this->assertCount(1, Storage::disk('local')->allFiles('reports'));
    }

    private function payload(string $clientUuid, array $overrides = []): array
    {
        $image = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            strict: true,
        );

        return array_replace([
            'client_uuid' => $clientUuid,
            'image' => UploadedFile::fake()->createWithContent('leaf.png', $image),
            'image_source_type' => 'camera',
            'source_width' => 1,
            'source_height' => 1,
            'predicted_label' => Report::LABEL_SMUT,
            'confidence' => 0.97,
            'class_scores' => [
                'healthy' => 0.01,
                'mosaic' => 0.01,
                'rust' => 0.01,
                'smut' => 0.97,
            ],
            'symptom_keys' => [Report::LABEL_SMUT],
            'reporter_observation_text' => 'Dark whip-like growths are visible.',
            'checklist_consistency' => 'consistent',
            'reported_severity' => 'moderate',
            'quality_warnings' => ['low-resolution'],
            'barangay' => 'Mabini',
            'model_version' => 'v1.0-mobilenetv2',
            'preprocess_ms' => 12.5,
            'inference_ms' => 95.75,
            'total_ms' => 122.25,
            'captured_at' => '2026-09-13T10:00:00.000Z',
        ], $overrides);
    }
}
