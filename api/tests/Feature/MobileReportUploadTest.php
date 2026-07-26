<?php

namespace Tests\Feature;

use App\Actions\Reports\PersistReport;
use App\Models\Report;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
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
