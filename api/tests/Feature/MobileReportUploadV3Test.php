<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class MobileReportUploadV3Test extends TestCase
{
    use RefreshDatabase;

    private const SURVEY_UUID = '90b2b84c-92c3-4cd6-b50f-cb0933e1a3aa';

    public function test_v3_stores_and_returns_the_field_survey_link(): void
    {
        Storage::fake('local');
        $clientUuid = fake()->uuid();

        $this->submit($clientUuid, ['field_survey_client_uuid' => self::SURVEY_UUID])
            ->assertCreated()
            ->assertJsonPath('data.identity.client_uuid', $clientUuid)
            ->assertJsonPath('data.identity.field_survey_client_uuid', self::SURVEY_UUID);

        $this->assertSame(
            self::SURVEY_UUID,
            Report::query()->where('client_uuid', $clientUuid)->sole()->field_survey_client_uuid,
        );
    }

    public function test_v3_stores_null_when_the_link_is_omitted_or_empty(): void
    {
        Storage::fake('local');
        $omitted = fake()->uuid();
        $empty = fake()->uuid();

        $this->submit($omitted)->assertCreated()
            ->assertJsonPath('data.identity.field_survey_client_uuid', null);
        $this->submit($empty, ['field_survey_client_uuid' => ''])->assertCreated()
            ->assertJsonPath('data.identity.field_survey_client_uuid', null);

        $this->assertNull(Report::query()->where('client_uuid', $omitted)->sole()->field_survey_client_uuid);
        $this->assertNull(Report::query()->where('client_uuid', $empty)->sole()->field_survey_client_uuid);
    }

    public function test_v3_rejects_a_non_uuid_link(): void
    {
        Storage::fake('local');

        $this->submit(fake()->uuid(), ['field_survey_client_uuid' => 'not-a-uuid'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('field_survey_client_uuid');
        $this->assertSame(0, Report::query()->count());
    }

    public function test_v3_retry_is_idempotent_and_keeps_the_first_link(): void
    {
        Storage::fake('local');
        $clientUuid = fake()->uuid();
        $other = '5a0e6f6e-0c07-4f0b-8d63-2f3f1f0a9b11';

        $this->submit($clientUuid, ['field_survey_client_uuid' => self::SURVEY_UUID])->assertCreated();
        $this->submit($clientUuid, ['field_survey_client_uuid' => self::SURVEY_UUID])
            ->assertOk()
            ->assertJsonPath('data.identity.field_survey_client_uuid', self::SURVEY_UUID);
        $this->submit($clientUuid, ['field_survey_client_uuid' => $other])
            ->assertOk()
            ->assertJsonPath('data.identity.field_survey_client_uuid', self::SURVEY_UUID);
        $this->submit($clientUuid)
            ->assertOk()
            ->assertJsonPath('data.identity.field_survey_client_uuid', self::SURVEY_UUID);

        $this->assertSame(1, Report::query()->where('client_uuid', $clientUuid)->count());
    }

    public function test_v2_ignores_the_link_and_its_response_is_unchanged(): void
    {
        Storage::fake('local');
        $clientUuid = fake()->uuid();

        $response = $this->actingToken()
            ->post('/api/v2/mobile/reports', $this->payload($clientUuid, [
                'field_survey_client_uuid' => self::SURVEY_UUID,
            ]))
            ->assertCreated()
            ->assertJsonMissingPath('data.identity.field_survey_client_uuid');

        $this->assertNull(Report::query()->where('client_uuid', $clientUuid)->sole()->field_survey_client_uuid);
        $this->assertSame(
            ['uuid', 'reference_code', 'client_uuid', 'scan_record_client_uuid'],
            array_keys($response->json('data.identity')),
        );
    }

    public function test_v3_does_not_confirm_a_location_that_v2_would_not(): void
    {
        Storage::fake('local');

        $this->submit(fake()->uuid(), [
            'field_survey_client_uuid' => self::SURVEY_UUID,
            'location_source' => 'gps',
        ])->assertUnprocessable()->assertJsonValidationErrors('final_latitude');
    }

    private function actingToken(): static
    {
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('mobile-v3-upload-test', ['report:submit'])->plainTextToken;

        return $this->withToken($token)->withHeader('Accept', 'application/json');
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function submit(string $clientUuid, array $overrides = []): TestResponse
    {
        $reporter = User::query()->where('email', 'v3-reporter@example.test')->first()
            ?? User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()
                ->create(['email' => 'v3-reporter@example.test']);

        return $this->withToken($reporter->createToken('mobile-v3-upload-test', ['report:submit'])->plainTextToken)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v3/mobile/reports', $this->payload($clientUuid, $overrides));
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
