<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Pagination\Cursor;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MobileReportStatusTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    public function test_status_feed_requires_authentication(): void
    {
        $this->getJson('/api/v1/mobile/reports/statuses')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');
    }

    public function test_the_legacy_updated_after_filter_cannot_narrow_the_status_snapshot(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $otherReporter = User::factory()->fieldReporter()->create();
        $older = Report::factory()->create(['reporter_id' => $reporter]);
        $matching = Report::factory()->create([
            'reporter_id' => $reporter,
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'review_notes' => 'Verified by office staff.',
        ]);
        Report::factory()->create(['reporter_id' => $otherReporter]);

        DB::table('reports')->where('id', $older->id)->update([
            'updated_at' => now()->subHours(2),
        ]);
        DB::table('reports')->where('id', $matching->id)->update([
            'updated_at' => now(),
        ]);

        $token = $reporter->createToken('mobile-status-test')->plainTextToken;

        $response = $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses?'.http_build_query([
                'updated_after' => now()->subHour()->toISOString(),
                'per_page' => 25,
            ]))
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('sync.total', 2)
            ->assertJsonStructure(['data', 'links', 'meta']);

        $returned = collect($response->json('data'));
        $this->assertContains($older->uuid, $returned->pluck('uuid'));
        $this->assertContains($matching->uuid, $returned->pluck('uuid'));
        $this->assertSame(
            Report::STATUS_VERIFIED_BY_STAFF,
            $returned->firstWhere('uuid', $matching->uuid)['review_status'],
        );
        $this->assertSame(
            'Verified by office staff.',
            $returned->firstWhere('uuid', $matching->uuid)['review_notes'],
        );
    }

    public function test_status_feed_rejects_malformed_checkpoints_and_page_sizes(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('invalid-status-query-test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses?'.http_build_query([
                'updated_after' => 'not-a-date',
                'sync_before' => 'also-not-a-date',
                'per_page' => 101,
            ]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR')
            ->assertJsonValidationErrors([
                'updated_after',
                'sync_before',
                'per_page',
            ]);
    }

    public function test_status_feed_rejects_an_invalid_cursor(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('invalid-cursor-test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses?cursor=not-a-cursor')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR')
            ->assertJsonValidationErrors('cursor');
    }

    public function test_forged_cursor_cannot_escape_owner_scope(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $otherReporter = User::factory()->fieldReporter()->create();
        $owned = Report::factory()->create(['reporter_id' => $reporter]);
        $other = Report::factory()->create(['reporter_id' => $otherReporter]);
        $cursor = (new Cursor([
            'updated_at' => $other->updated_at->format('Y-m-d H:i:s'),
            'id' => $other->id,
        ]))->encode();
        $token = $reporter->createToken('forged-cursor-test')->plainTextToken;
        $version = $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses')
            ->assertOk()
            ->json('sync.version');

        $response = $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses?'.http_build_query([
                'cursor' => $cursor,
                'sync_version' => $version,
            ]))
            ->assertOk();

        $this->assertNotContains(
            $other->uuid,
            collect($response->json('data'))->pluck('uuid')->all(),
        );
        $this->assertNotNull($owned->uuid);
    }

    public function test_status_feed_preserves_the_five_wire_statuses(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $statuses = Report::reviewStatuses();

        foreach ($statuses as $index => $status) {
            Report::factory()->create([
                'reporter_id' => $reporter,
                'review_status' => $status,
                'updated_at' => now()->subMinutes(count($statuses) - $index),
            ]);
        }

        $token = $reporter->createToken('wire-status-test')->plainTextToken;

        $response = $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses')
            ->assertOk()
            ->assertJsonCount(count($statuses), 'data');

        $this->assertSame(
            $statuses,
            collect($response->json('data'))->pluck('review_status')->all(),
        );
    }

    public function test_status_feed_uses_authenticated_owner_not_query_identity(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $otherReporter = User::factory()->fieldReporter()->create();
        $owned = Report::factory()->create([
            'reporter_id' => $reporter,
            'updated_at' => now()->subMinute(),
        ]);
        $other = Report::factory()->create([
            'reporter_id' => $otherReporter,
            'updated_at' => now()->subMinute(),
        ]);
        $token = $reporter->createToken('owner-bound-status-test')->plainTextToken;
        $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses?'.http_build_query([
                'reporter_id' => $otherReporter->getKey(),
                'owner_id' => $otherReporter->uuid,
            ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $owned->uuid)
            ->assertJsonMissing(['uuid' => $other->uuid]);
    }

    public function test_status_serializer_is_exact_current_snapshot_and_omits_reviewer_identity(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $reviewer = User::factory()->reviewer()->create([
            'email' => 'reviewer-private@example.test',
            'name' => 'Private reviewer name',
        ]);
        $reviewedAt = CarbonImmutable::now()->subMinutes(2)->setMicrosecond(123000);
        $updatedAt = CarbonImmutable::now()->subMinute()->setMicrosecond(0);
        $report = Report::factory()->create([
            'reporter_id' => $reporter,
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'review_notes' => 'Latest authority note.',
            'reviewer_id' => $reviewer,
            'reviewed_at' => $reviewedAt,
            'updated_at' => $updatedAt,
        ]);
        $token = $reporter->createToken('serializer-status-test')->plainTextToken;

        $response = $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses')
            ->assertOk()
            ->assertJsonStructure([
                'data',
                'links',
                'meta',
                'sync' => ['before'],
            ]);

        $this->assertSame([
            'uuid' => $report->uuid,
            'client_uuid' => $report->client_uuid,
            'reference_code' => $report->reference_code,
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'review_notes' => 'Latest authority note.',
            'reviewed_at' => $reviewedAt->toISOString(),
            'updated_at' => $updatedAt->toISOString(),
        ], $response->json('data.0'));
    }

    public function test_v3_feed_adds_lifecycle_and_workflow_status_without_touching_legacy_fields(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'reporter_id' => $reporter,
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'case_state' => Report::CASE_STATE_CLOSED,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
            'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
        ]);
        $token = $reporter->createToken('v3-lifecycle-status-test')->plainTextToken;

        $query = '?sync_before='.urlencode(now()->addMinute()->toISOString());
        $v3 = $this->withToken($token)->getJson('/api/v3/mobile/reports/statuses'.$query)->assertOk();
        $v2 = $this->withToken($token)->getJson('/api/v2/mobile/reports/statuses'.$query)->assertOk();

        $this->assertSame([
            'case_state' => 'closed',
            'verification_outcome' => 'verified',
            'field_validation_state' => 'completed',
            'referral_state' => 'not_referred',
        ], $v3->json('data.0.lifecycle'));
        $this->assertSame('resolved', $v3->json('data.0.workflow_status'));
        $this->assertSame(Report::STATUS_VERIFIED_BY_STAFF, $v3->json('data.0.review_status'));
        $this->assertArrayNotHasKey('lifecycle', $v2->json('data.0'));
        $this->assertArrayNotHasKey('workflow_status', $v2->json('data.0'));
    }

    public function test_workflow_status_follows_web_derivation_precedence(): void
    {
        $open = ['case_state' => Report::CASE_STATE_OPEN];
        $cases = [
            'resolved' => ['case_state' => Report::CASE_STATE_CLOSED, 'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED],
            'field_validation' => $open + ['field_validation_state' => Report::FIELD_VALIDATION_STATE_IN_PROGRESS, 'referral_state' => Report::REFERRAL_STATE_REFERRED],
            'referred' => $open + ['referral_state' => Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED, 'scheduled_revisit' => true],
            'follow_up' => $open + ['scheduled_revisit' => true, 'first_reviewed_at' => now()],
            'under_review' => $open + ['first_reviewed_at' => now()],
            'needs_review' => $open,
        ];

        foreach ($cases as $expected => $attributes) {
            $this->assertSame($expected, Report::factory()->make($attributes)->workflowStatus(), $expected);
        }
    }

    public function test_reviewer_cannot_read_mobile_status_feed(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $token = $reviewer
            ->createToken('reviewer-status-test')
            ->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_admin_cannot_read_mobile_status_feed(): void
    {
        $admin = User::factory()->admin()->create();
        $token = $admin->createToken('admin-status-test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_status_feed_requires_report_status_token_ability(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter
            ->createToken('submit-only', ['report:submit'])
            ->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_a_mid_sync_status_update_restarts_the_traversal_without_skipping_rows(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $reports = Report::factory()->count(5)->create([
            'reporter_id' => $reporter,
        ]);
        $tiedTimestamp = now()->subMinute()->startOfSecond();

        DB::table('reports')
            ->whereIn('id', $reports->pluck('id'))
            ->update(['updated_at' => $tiedTimestamp]);

        $token = $reporter->createToken('complete-cursor-status-test')->plainTextToken;
        $first = $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses?per_page=2')
            ->assertOk();
        $nextUrl = $first->json('links.next');
        $this->assertNotNull($nextUrl);

        DB::table('reports')
            ->where('uuid', $first->json('data.0.uuid'))
            ->update(['updated_at' => now()]);

        $nextPath = parse_url($nextUrl, PHP_URL_PATH).'?'
            .parse_url($nextUrl, PHP_URL_QUERY);
        $this->withToken($token)
            ->getJson($nextPath)
            ->assertStatus(409)
            ->assertJsonPath('code', 'SYNC_RESTART');

        $restarted = collect();
        $url = '/api/v1/mobile/reports/statuses?per_page=2';
        while ($url !== null) {
            $page = $this->withToken($token)->getJson($url)->assertOk();
            $restarted = $restarted->merge(collect($page->json('data'))->pluck('uuid'));
            $url = $page->json('links.next');
        }

        $this->assertCount(5, $restarted);
        $this->assertCount(5, $restarted->unique());
        $this->assertSame(
            $reports->pluck('uuid')->sort()->values()->all(),
            $restarted->sort()->values()->all(),
        );
    }

    public function test_status_cursor_is_stable_across_tied_timestamps(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $reports = Report::factory()->count(4)->create([
            'reporter_id' => $reporter,
        ]);
        $tiedTimestamp = now()->subMinute()->startOfSecond();

        DB::table('reports')
            ->whereIn('id', $reports->pluck('id'))
            ->update(['updated_at' => $tiedTimestamp]);

        $token = $reporter->createToken('cursor-status-test')->plainTextToken;
        $first = $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses?per_page=2')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $firstUuids = collect($first->json('data'))->pluck('uuid');
        $syncBefore = $first->json('sync.before');
        $nextUrl = $first->json('links.next');
        $this->assertNotNull($nextUrl);
        $this->assertStringContainsString(
            'sync_version='.$first->json('sync.version'),
            urldecode($nextUrl),
        );

        $nextPath = parse_url($nextUrl, PHP_URL_PATH).'?'
            .parse_url($nextUrl, PHP_URL_QUERY);
        $second = $this->withToken($token)
            ->getJson($nextPath)
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('sync.before', $syncBefore);

        $allUuids = $firstUuids
            ->merge(collect($second->json('data'))->pluck('uuid'));

        $this->assertCount(4, $allUuids);
        $this->assertCount(4, $allUuids->unique());
        $this->assertStringContainsString(
            'sync_before=',
            urldecode($nextUrl),
        );
    }
}
