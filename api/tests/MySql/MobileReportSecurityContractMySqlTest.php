<?php

namespace Tests\MySql;

use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Pagination\Cursor;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileReportSecurityContractMySqlTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/^(caneguard_test|firstmate_[a-z0-9_]+)$/D', DB::connection()->getDatabaseName());
    }

    public function test_mysql_review_snapshot_survives_reload_and_mobile_serialization(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create(['reporter_id' => $reporter]);
        $reviewerToken = $reviewer->createToken('mysql-review-persistence')->plainTextToken;

        Auth::forgetGuards();
        $this->withToken($reviewerToken)
            ->patchJson("/api/v1/reports/{$report->uuid}/review", [
                'status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'field_validation_assignee_uuid' => $reporter->uuid,
                'notes' => 'MySQL persistence contract note.',
                'expected_version' => 0,
            ])
            ->assertOk();

        $updated = $report->fresh();
        $this->assertSame(Report::STATUS_FOR_FIELD_VALIDATION, $updated->review_status);
        $this->assertSame('MySQL persistence contract note.', $updated->review_notes);
        $this->assertSame($reviewer->getKey(), $updated->reviewer_id);
        $this->assertNotNull($updated->reviewed_at);
        $this->assertNotNull($updated->updated_at);
        $this->assertSame(1, $updated->lock_version);

        $statusToken = $reporter->createToken(
            'mysql-status-persistence',
            ['report:status'],
        )->plainTextToken;
        $syncBefore = CarbonImmutable::instance($updated->updated_at)
            ->addSecond()
            ->toISOString();

        Auth::forgetGuards();
        $response = $this->withToken($statusToken)
            ->getJson('/api/v1/mobile/reports/statuses?sync_before='.urlencode($syncBefore))
            ->assertOk();

        $this->assertSame([
            'uuid' => $updated->uuid,
            'client_uuid' => $updated->client_uuid,
            'reference_code' => $updated->reference_code,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'review_notes' => 'MySQL persistence contract note.',
            'reviewed_at' => $updated->reviewed_at->utc()->toISOString(),
            'updated_at' => $updated->updated_at->utc()->toISOString(),
        ], $response->json('data.0'));
        $this->assertArrayNotHasKey('reviewer_id', $response->json('data.0'));
        $this->assertArrayNotHasKey('reviewer', $response->json('data.0'));
    }

    public function test_mysql_cursor_checkpoint_is_owner_bound_and_complete_after_mid_sync_update(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $otherReporter = User::factory()->fieldReporter()->create();
        $ownedReports = Report::factory()->count(5)->create([
            'reporter_id' => $reporter,
        ]);
        $otherReport = Report::factory()->create(['reporter_id' => $otherReporter]);
        $tiedTimestamp = CarbonImmutable::now()->subMinute()->startOfSecond();

        DB::table('reports')
            ->whereIn('id', $ownedReports->pluck('id')->push($otherReport->id))
            ->update(['updated_at' => $tiedTimestamp]);

        $statusToken = $reporter->createToken(
            'mysql-cursor-security',
            ['report:status'],
        )->plainTextToken;
        $syncBefore = $tiedTimestamp->addSecond()->toISOString();
        $query = http_build_query([
            'per_page' => 2,
            'sync_before' => $syncBefore,
        ]);

        Auth::forgetGuards();
        $first = $this->withToken($statusToken)
            ->getJson('/api/v1/mobile/reports/statuses?'.$query)
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('sync.before', $syncBefore);
        $seen = collect($first->json('data'))->pluck('uuid');
        $nextUrl = $first->json('links.next');

        DB::table('reports')
            ->where('uuid', $seen->first())
            ->update(['updated_at' => $tiedTimestamp->addMinute()]);

        while ($nextUrl !== null) {
            $nextPath = parse_url($nextUrl, PHP_URL_PATH).'?'
                .parse_url($nextUrl, PHP_URL_QUERY);
            Auth::forgetGuards();
            $page = $this->withToken($statusToken)
                ->getJson($nextPath)
                ->assertOk()
                ->assertJsonPath('sync.before', $syncBefore);
            $seen = $seen->merge(collect($page->json('data'))->pluck('uuid'));
            $nextUrl = $page->json('links.next');
        }

        $this->assertCount(5, $seen);
        $this->assertCount(5, $seen->unique());
        $this->assertSame(
            $ownedReports->pluck('uuid')->sort()->values()->all(),
            $seen->sort()->values()->all(),
        );

        $forgedCursor = (new Cursor([
            'updated_at' => $otherReport->updated_at->format('Y-m-d H:i:s'),
            'id' => $otherReport->id,
        ]))->encode();
        Auth::forgetGuards();
        $forgedResponse = $this->withToken($statusToken)
            ->getJson('/api/v1/mobile/reports/statuses?'.http_build_query([
                'cursor' => $forgedCursor,
                'sync_before' => $syncBefore,
            ]))
            ->assertOk();

        $this->assertNotContains(
            $otherReport->uuid,
            collect($forgedResponse->json('data'))->pluck('uuid')->all(),
        );
    }

    public function test_mysql_middleware_policy_and_optimistic_review_boundaries_are_enforced(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $otherReporter = User::factory()->fieldReporter()->create();
        $reviewer = User::factory()->reviewer()->create();
        $admin = User::factory()->admin()->create();
        $report = Report::factory()->create(['reporter_id' => $otherReporter]);

        $this->getJson('/api/v1/mobile/reports/statuses')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        $reporterToken = $reporter->createToken(
            'mysql-submit-only',
            ['report:submit'],
        )->plainTextToken;
        Auth::forgetGuards();
        $this->withToken($reporterToken)
            ->getJson('/api/v1/mobile/reports/statuses')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        $reviewerStatusToken = $reviewer->createToken(
            'mysql-reviewer-status',
            ['report:status'],
        )->plainTextToken;
        Auth::forgetGuards();
        $this->withToken($reviewerStatusToken)
            ->getJson('/api/v1/mobile/reports/statuses')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs($reporter);
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_RESOLVED,
            'notes' => 'Cross-owner reporter attempt.',
            'expected_version' => 0,
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs($reviewer);
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_assignee_uuid' => $report->reporter->uuid,
            'notes' => 'Reviewer mutation.',
            'expected_version' => 0,
        ])->assertOk();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_RESOLVED,
            'notes' => 'Stale admin attempt.',
            'expected_version' => 0,
        ])
            ->assertConflict()
            ->assertJsonPath('code', 'CONFLICT');

        $this->assertDatabaseHas('reports', [
            'uuid' => $report->uuid,
            'reporter_id' => $otherReporter->getKey(),
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'review_notes' => 'Reviewer mutation.',
            'reviewer_id' => $reviewer->getKey(),
            'lock_version' => 1,
        ]);
    }

    public function test_mysql_idempotent_resubmission_preserves_review_and_owner_scoped_identity(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        $otherReporter = User::factory()->fieldReporter()->create();
        $reviewer = User::factory()->reviewer()->create();
        $clientUuid = (string) Str::uuid();
        $report = Report::factory()->create([
            'reporter_id' => $reporter,
            'client_uuid' => $clientUuid,
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'review_notes' => 'Immutable for retry.',
            'reviewer_id' => $reviewer,
            'reviewed_at' => CarbonImmutable::now()->subMinute(),
            'lock_version' => 7,
        ]);
        $before = $report->fresh();
        $children = [
            'report_class_scores' => DB::table('report_class_scores')
                ->where('report_id', $report->id)
                ->count(),
            'report_symptoms' => DB::table('report_symptoms')
                ->where('report_id', $report->id)
                ->count(),
            'report_quality_warnings' => DB::table('report_quality_warnings')
                ->where('report_id', $report->id)
                ->count(),
        ];
        $token = $reporter->createToken('mysql-idempotent-retry')->plainTextToken;

        Auth::forgetGuards();
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
        $this->assertSame($before->reporter_id, $after->reporter_id);
        $this->assertSame($before->review_status, $after->review_status);
        $this->assertSame($before->review_notes, $after->review_notes);
        $this->assertSame($before->reviewer_id, $after->reviewer_id);
        $this->assertSame(
            $before->reviewed_at?->toISOString(),
            $after->reviewed_at?->toISOString(),
        );
        $this->assertSame($before->updated_at?->toISOString(), $after->updated_at?->toISOString());
        $this->assertSame($before->lock_version, $after->lock_version);
        $this->assertSame(1, Report::query()->where('client_uuid', $clientUuid)->count());

        foreach ($children as $table => $count) {
            $this->assertSame(
                $count,
                DB::table($table)->where('report_id', $report->id)->count(),
            );
        }

        Auth::forgetGuards();
        $otherToken = $otherReporter->createToken('mysql-owner-collision')->plainTextToken;
        $this->withToken($otherToken)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid))
            ->assertCreated()
            ->assertJsonPath('data.identity.uuid', fn (string $uuid) => $uuid !== $before->uuid)
            ->assertJsonPath('data.reporter.uuid', $otherReporter->uuid);

        $this->assertSame(2, Report::query()->where('client_uuid', $clientUuid)->count());
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
