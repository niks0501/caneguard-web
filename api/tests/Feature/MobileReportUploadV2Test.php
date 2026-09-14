<?php

namespace Tests\Feature;

use App\Contracts\MobileReportUploadV2Contract;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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
