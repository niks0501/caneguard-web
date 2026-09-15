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
use Tests\TestCase;

class MobileReportUploadV2Test extends TestCase
{
    use RefreshDatabase;

    public function test_v2_accepts_and_persists_a_smut_model_v1_report(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-upload-test', ['report:submit'])->plainTextToken;
        $clientUuid = fake()->uuid();

        $response = $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid));

        $response
            ->assertCreated()
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
        Storage::disk('local')->assertExists($report->image_path);
    }

    public function test_v2_preserves_rssi_reporter_observation_without_changing_model_v1_evidence(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
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

    public function test_v2_retry_omits_reviewer_and_audit_identity(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $reviewer = User::factory()->reviewer()->create([
            'email' => 'reviewer-private@example.test',
            'name' => 'Private reviewer name',
        ]);
        $clientUuid = fake()->uuid();
        $report = Report::factory()->mobileModelV1()->create([
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
        $reporter = User::factory()->fieldReporter()->create();
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
        $this->assertSame(4, count(MobileReportUploadV2Contract::field('class_scores')['required_keys']));
    }

    public function test_v2_status_feed_exposes_a_completed_authority_review_to_mobile(): void
    {
        CarbonImmutable::setTestNow('2026-09-13T10:00:00Z');
        try {
            $reporter = User::factory()->fieldReporter()->create();
            $reviewer = User::factory()->reviewer()->create();
            $report = Report::factory()->mobileModelV1()->create([
                'reporter_id' => $reporter,
                'predicted_label' => Report::LABEL_SMUT,
            ]);

            $reviewerToken = $reviewer->createToken('web-review', ['*'])->plainTextToken;
            $this->withToken($reviewerToken)
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
            $reporter = User::factory()->fieldReporter()->create();
            $report = Report::factory()->create(['reporter_id' => $reporter]);
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
        $reporter = User::factory()->fieldReporter()->create();
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
        $reporter = User::factory()->fieldReporter()->create();
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
        $reporter = User::factory()->fieldReporter()->create();
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
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v2-location', ['report:submit'])->plainTextToken;
        $clientUuid = fake()->uuid();

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid, [
                'barangay' => 'Mabini',
                'location_source' => Report::LOCATION_SOURCE_UNAVAILABLE,
                'location_unavailable_reason' => Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
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
        $this->assertSame('Mabini', $report->barangay);
    }

    public function test_v2_rejects_incoherent_location_provenance(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
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
