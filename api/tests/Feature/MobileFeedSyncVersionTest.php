<?php

namespace Tests\Feature;

use App\Models\Advisory;
use App\Models\Report;
use App\Models\User;
use App\Notifications\NewCaseSubmittedNotification;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Proposals (unpromoted) for the notifications and report-status feed stamps.
 */
class MobileFeedSyncVersionTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
        $this->owner = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
    }

    private function notify(Report $report, ?string $readAt = null): string
    {
        $id = (string) Str::uuid();
        DatabaseNotification::query()->insert([
            'id' => $id,
            'type' => NewCaseSubmittedNotification::class,
            'notifiable_type' => $this->owner->getMorphClass(),
            'notifiable_id' => $this->owner->getKey(),
            'data' => json_encode(['event_type' => 'new_case_submitted', 'title' => 'T', 'report_uuid' => $report->uuid, 'reference_code' => $report->reference_code]),
            'read_at' => $readAt,
            'created_at' => now()->subMinute(),
            'updated_at' => now()->subMinute(),
        ]);

        return $id;
    }

    /** @return array<string, mixed> */
    private function feed(string $path, string $query = ''): array
    {
        Sanctum::actingAs($this->owner, ['notification:read', 'report:status']);

        return $this->getJson($path.$query)->assertOk()->json();
    }

    // Proposal - proves: an unchanged notifications poll answers without resending the feed.
    public function test_unchanged_notifications_poll_returns_no_rows(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create(['reporter_id' => $this->owner->getKey()]);
        $this->notify($report);
        $first = $this->feed('/api/v1/mobile/notifications');
        $this->assertCount(1, $first['data']);
        $this->assertSame(1, $first['sync']['total']);
        $this->assertFalse($first['sync']['truncated']);
        $this->assertFalse($first['sync']['unchanged']);

        $again = $this->feed('/api/v1/mobile/notifications', '?since='.$first['sync']['version']);
        $this->assertSame([], $again['data']);
        $this->assertTrue($again['sync']['unchanged']);
        $this->assertSame($first['sync']['version'], $again['sync']['version']);
    }

    // Proposal - proves: any visible change (new item, read state) moves the notifications version.
    public function test_new_and_read_notifications_move_the_version(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create(['reporter_id' => $this->owner->getKey()]);
        $id = $this->notify($report);
        $v1 = $this->feed('/api/v1/mobile/notifications')['sync']['version'];

        DatabaseNotification::query()->whereKey($id)->update(['read_at' => now()]);
        $v2 = $this->feed('/api/v1/mobile/notifications')['sync']['version'];
        $this->notify($report);
        $changed = $this->feed('/api/v1/mobile/notifications', '?since='.$v2);

        $this->assertNotSame($v1, $v2);
        $this->assertNotSame($v2, $changed['sync']['version']);
        $this->assertFalse($changed['sync']['unchanged']);
        $this->assertCount(2, $changed['data']);
    }

    // Proposal - proves: an unchanged status poll answers without resending the feed.
    public function test_unchanged_status_poll_returns_no_rows(): void
    {
        Report::factory()->inDistrict($this->pilotDistrict())->create(['reporter_id' => $this->owner->getKey()]);
        $first = $this->feed('/api/v1/mobile/reports/statuses');
        $this->assertCount(1, $first['data']);
        $this->assertSame(1, $first['sync']['total']);
        $this->assertFalse($first['sync']['truncated']);

        $again = $this->feed('/api/v1/mobile/reports/statuses', '?since='.$first['sync']['version']);
        $this->assertSame([], $again['data']);
        $this->assertTrue($again['sync']['unchanged']);
    }

    // Proposal - proves: a review decision moves the status version.
    public function test_review_change_moves_the_status_version(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create(['reporter_id' => $this->owner->getKey()]);
        $v1 = $this->feed('/api/v1/mobile/reports/statuses')['sync']['version'];

        DB::table('reports')->where('id', $report->id)->update([
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'review_notes' => 'Verified.',
            'updated_at' => now(),
        ]);
        $after = $this->feed('/api/v1/mobile/reports/statuses', '?since='.$v1);

        $this->assertNotSame($v1, $after['sync']['version']);
        $this->assertFalse($after['sync']['unchanged']);
        $this->assertCount(1, $after['data']);
    }

    // Proves: sync.before is the response instant and its own second is the
    // snapshot ceiling, so a review committed in that second reaches the phone.
    public function test_the_status_checkpoint_is_never_in_the_future(): void
    {
        CarbonImmutable::setTestNow('2026-11-10T12:00:00.200000Z');
        try {
            $reviewed = Report::factory()->inDistrict($this->pilotDistrict())->create([
                'reporter_id' => $this->owner->getKey(),
            ]);
            $nextSecond = Report::factory()->inDistrict($this->pilotDistrict())->create([
                'reporter_id' => $this->owner->getKey(),
            ]);
            DB::table('reports')->where('id', $nextSecond->id)->update([
                'updated_at' => '2026-11-10 12:00:01',
            ]);

            $first = $this->feed('/api/v1/mobile/reports/statuses');
            $this->assertSame([$reviewed->uuid], collect($first['data'])->pluck('uuid')->all());
            $checkpoint = $first['sync']['before'];
            $this->assertTrue(
                CarbonImmutable::parse($checkpoint)->lessThanOrEqualTo(CarbonImmutable::now()),
            );

            DB::table('reports')->where('id', $reviewed->id)->update([
                'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
                'review_notes' => 'Reviewed inside the checkpoint second.',
                'updated_at' => '2026-11-10 12:00:00.800',
            ]);

            $after = $this->feed('/api/v1/mobile/reports/statuses?since='
                .$first['sync']['version']
                .'&updated_after='.urlencode($checkpoint));

            $this->assertNotSame($first['sync']['version'], $after['sync']['version']);
            $this->assertFalse($after['sync']['unchanged']);
            $delivered = collect($after['data'])->firstWhere('uuid', $reviewed->uuid);
            $this->assertSame(Report::STATUS_VERIFIED_BY_STAFF, $delivered['review_status']);
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    // Proves: a legacy delta poll still receives a review whose stored second
    // is the checkpoint's own second.
    public function test_a_delta_poll_receives_a_review_stored_in_the_checkpoint_second(): void
    {
        CarbonImmutable::setTestNow('2026-11-10T12:00:00.200000Z');
        try {
            $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
                'reporter_id' => $this->owner->getKey(),
            ]);
            $checkpoint = $this->feed('/api/v1/mobile/reports/statuses')['sync']['before'];

            DB::table('reports')->where('id', $report->id)->update([
                'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
                'review_notes' => 'Reviewed inside the checkpoint second.',
                'updated_at' => '2026-11-10 12:00:00.800',
            ]);

            $delta = $this->feed(
                '/api/v1/mobile/reports/statuses?updated_after='.urlencode($checkpoint),
            );

            $this->assertCount(1, $delta['data']);
            $this->assertSame(Report::STATUS_VERIFIED_BY_STAFF, $delta['data'][0]['review_status']);
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    // Proves: a v3 change carried by the related advisory reaches the phone
    // with the version that describes it.
    public function test_a_retired_advisory_reaches_a_version_aware_v3_poll(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $advisory = Advisory::factory()->validated($reviewer, 'Validated by the office field guide.')->create([
            'code' => 'ADV-SYNC-001',
            'title' => 'Sanitize tools',
            'content' => 'Disinfect tools before the next row.',
        ]);
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reporter_id' => $this->owner->getKey(),
            'advisory_id' => $advisory->getKey(),
            'advisory_selected_by_id' => $reviewer->getKey(),
            'advisory_selected_at' => now()->utc(),
            'advisory_delivery_state' => Report::ADVISORY_DELIVERY_DELIVERED,
            'advisory_delivered_at' => now()->utc(),
        ]);

        $first = $this->feed('/api/v3/mobile/reports/statuses');
        $this->assertSame(Advisory::STATUS_VALIDATED, $first['data'][0]['advisory']['status']);

        Sanctum::actingAs($reviewer);
        $this->postJson("/api/v1/advisories/{$advisory->uuid}/retire", [])->assertOk();

        $after = $this->feed('/api/v3/mobile/reports/statuses?since='
            .$first['sync']['version']
            .'&updated_after='.urlencode($first['sync']['before']));

        $this->assertNotSame($first['sync']['version'], $after['sync']['version']);
        $this->assertFalse($after['sync']['unchanged']);
        $this->assertCount(1, $after['data']);
        $this->assertSame($report->uuid, $after['data'][0]['uuid']);
        $this->assertSame(Advisory::STATUS_RETIRED, $after['data'][0]['advisory']['status']);
    }

    // Proves: a stale version keeps the whole snapshot on every continuation
    // page instead of letting the stale delta filter drop rows.
    public function test_a_stale_version_serves_the_whole_snapshot_across_pages(): void
    {
        $reports = Report::factory()->count(3)->inDistrict($this->pilotDistrict())->create([
            'reporter_id' => $this->owner->getKey(),
        ]);
        DB::table('reports')->whereIn('id', $reports->pluck('id'))->update([
            'updated_at' => now()->subMinute()->startOfSecond(),
        ]);
        $first = $this->feed('/api/v3/mobile/reports/statuses');
        $this->assertCount(3, $first['data']);

        DB::table('reports')->where('id', $reports->first()->id)->update([
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
        ]);

        $page = $this->feed('/api/v3/mobile/reports/statuses?per_page=2&since='
            .$first['sync']['version']
            .'&updated_after='.urlencode($first['sync']['before']));
        $this->assertFalse($page['sync']['unchanged']);
        $this->assertCount(2, $page['data']);
        $next = $page['links']['next'];
        $this->assertNotNull($next);

        $seen = collect($page['data'])->pluck('uuid');
        $continuation = $this->feed(
            parse_url($next, PHP_URL_PATH),
            '?'.parse_url($next, PHP_URL_QUERY),
        );

        $continuationUuids = collect($continuation['data'])->pluck('uuid');
        $this->assertSame($page['sync']['before'], $continuation['sync']['before']);
        $this->assertCount(1, $continuationUuids);
        $this->assertCount(3, $seen->merge($continuationUuids)->unique());
    }
}
