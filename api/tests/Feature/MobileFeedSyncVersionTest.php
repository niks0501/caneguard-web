<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use App\Notifications\NewCaseSubmittedNotification;
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
}
