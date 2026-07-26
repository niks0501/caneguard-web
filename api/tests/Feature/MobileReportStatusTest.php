<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MobileReportStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_field_reporter_receives_only_owned_statuses_updated_after_cursor(): void
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

        $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/statuses?'.http_build_query([
                'updated_after' => now()->subHour()->toISOString(),
                'per_page' => 25,
            ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $matching->uuid)
            ->assertJsonPath(
                'data.0.review_status',
                Report::STATUS_VERIFIED_BY_STAFF,
            )
            ->assertJsonPath(
                'data.0.review_notes',
                'Verified by office staff.',
            )
            ->assertJsonStructure(['data', 'links', 'meta']);
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

    public function test_status_cursor_is_stable_across_ties_and_mid_sync_updates(): void
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

        DB::table('reports')
            ->where('uuid', $firstUuids->first())
            ->update(['updated_at' => now()->addMinute()]);

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
