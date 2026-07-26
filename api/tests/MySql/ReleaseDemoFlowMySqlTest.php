<?php

namespace Tests\MySql;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class ReleaseDemoFlowMySqlTest extends TestCase
{
    use DatabaseTransactions;

    private ?string $clientUuid = null;

    private ?string $uploadedImagePath = null;

    public function test_release_demo_flow_persists_a_review_across_requests(): void
    {
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertSame('caneguard_test', DB::connection()->getDatabaseName());

        $reviewer = User::query()
            ->where('email', 'mao@caneguard.test')
            ->firstOrFail();
        $fieldReporter = User::query()
            ->where('email', 'field@caneguard.test')
            ->firstOrFail();
        $reviewerPassword = config(
            'caneguard.demo_users.reviewer_password',
        );

        $this->assertIsString($reviewerPassword);
        $this->assertNotSame('', $reviewerPassword);

        $this->get('/sanctum/csrf-cookie')
            ->assertNoContent()
            ->assertCookie('XSRF-TOKEN');
        $this->postJson('/login', [
            'email' => $reviewer->email,
            'password' => $reviewerPassword,
        ])->assertNoContent();
        $this->getJson('/api/v1/dashboard/summary')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'counts' => ['total_submitted'],
                    'recent_reports',
                ],
            ]);

        // The mobile submission uses a separate bearer-token client in the
        // live demo. Clear the simulated browser guard before that request.
        Auth::guard('web')->logout();
        Auth::forgetGuards();
        $this->flushSession();

        $token = $fieldReporter
            ->createToken('release-demo-rehearsal')
            ->plainTextToken;
        $clientUuid = (string) Str::uuid();
        $this->clientUuid = $clientUuid;
        $uploaded = $this->withToken($token)
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid))
            ->assertCreated()
            ->assertJsonPath('data.identity.client_uuid', $clientUuid)
            ->assertJsonPath(
                'data.review.status',
                Report::STATUS_SUBMITTED_UNVERIFIED,
            );

        $reportUuid = $uploaded->json('data.identity.uuid');
        $report = Report::query()->where('uuid', $reportUuid)->firstOrFail();
        $this->uploadedImagePath = $report->image_path;
        Storage::disk('local')->assertExists($this->uploadedImagePath);

        $this->withoutToken();
        Auth::forgetGuards();
        Auth::shouldUse('web');
        $this->postJson('/login', [
            'email' => $reviewer->email,
            'password' => $reviewerPassword,
        ])->assertNoContent();
        $this->getJson(
            '/api/v1/reports?search='.urlencode($report->reference_code),
        )
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.uuid', $reportUuid);
        $detail = $this->getJson("/api/v1/reports/{$reportUuid}")
            ->assertOk()
            ->assertJsonPath('data.identity.uuid', $reportUuid);

        $version = $detail->json('data.version');
        $note = 'Release rehearsal: schedule an on-site field observation.';
        $this->patchJson("/api/v1/reports/{$reportUuid}/review", [
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'notes' => $note,
            'expected_version' => $version,
        ])
            ->assertOk()
            ->assertJsonPath(
                'data.review.status',
                Report::STATUS_FOR_FIELD_VALIDATION,
            )
            ->assertJsonPath('data.review.notes', $note)
            ->assertJsonPath('data.review.reviewer.uuid', $reviewer->uuid);

        $this->getJson("/api/v1/reports/{$reportUuid}")
            ->assertOk()
            ->assertJsonPath(
                'data.review.status',
                Report::STATUS_FOR_FIELD_VALIDATION,
            )
            ->assertJsonPath('data.review.notes', $note);
        $this->assertDatabaseHas('reports', [
            'uuid' => $reportUuid,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'review_notes' => $note,
            'reviewer_id' => $reviewer->getKey(),
        ]);

        $this->postJson('/logout')->assertNoContent();
        Auth::forgetGuards();
        Auth::shouldUse('web');
        $this->getJson('/api/v1/me')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');
    }

    protected function tearDown(): void
    {
        try {
            $path = $this->uploadedImagePath;

            if ($path === null && $this->clientUuid !== null) {
                $path = Report::query()
                    ->where('client_uuid', $this->clientUuid)
                    ->value('image_path');
            }

            if (is_string($path)) {
                Storage::disk('local')->delete($path);
                $this->assertFalse(Storage::disk('local')->exists($path));
            }
        } finally {
            parent::tearDown();
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $clientUuid): array
    {
        $image = file_get_contents(
            database_path(
                'seeders/assets/synthetic-sugarcane-rust.png',
            ),
        );
        $this->assertIsString($image);

        return [
            'client_uuid' => $clientUuid,
            'image' => UploadedFile::fake()->createWithContent(
                'release-rehearsal.png',
                $image,
            ),
            'image_source_type' => 'camera',
            'source_width' => 1254,
            'source_height' => 1254,
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
            'quality_warnings' => [],
            'barangay' => 'Mabini',
            'model_version' => 'caneguard-mobile-v1.0.0',
            'preprocess_ms' => 12.5,
            'inference_ms' => 95.75,
            'total_ms' => 122.25,
            'captured_at' => '2026-07-27T09:00:00.456+08:00',
        ];
    }
}
