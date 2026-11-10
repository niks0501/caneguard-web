<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Proposals for lane L6 (server side). Each test names the proof-intent
 * requirement it covers; none is promoted to proof until the captain or
 * aki-secondmate says so.
 */
class MobileAssignmentSyncVersionTest extends TestCase
{
    use RefreshDatabase;

    private User $reviewer;

    private User $inspector;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
        $this->reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $this->inspector = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
    }

    private function assign(?User $assignee = null, array $report = [], array $assignment = []): FieldValidationAssignment
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create($report + [
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);

        return FieldValidationAssignment::factory()->create($assignment + [
            'report_id' => $report->getKey(),
            'assignee_id' => ($assignee ?? $this->inspector)->getKey(),
            'assigned_by_id' => $this->reviewer->getKey(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function sync(string $query = '', ?User $as = null): array
    {
        Sanctum::actingAs($as ?? $this->inspector, ['assignment:read']);

        return $this->getJson('/api/v1/mobile/assignments'.$query)->assertOk()->json('sync');
    }

    private function feedQueryCount(): int
    {
        Sanctum::actingAs($this->inspector, ['assignment:read']);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/v1/mobile/assignments')->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    /**
     * @return array<int, string>
     */
    private function feedUuids(string $path): array
    {
        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $uuids = [];
        $url = $path;
        while ($url !== null) {
            $page = $this->getJson($url)->assertOk();
            array_push($uuids, ...array_column($page->json('data'), 'uuid'));
            $next = $page->json('links.next');
            $url = $next === null ? null : parse_url($next, PHP_URL_PATH).'?'.parse_url($next, PHP_URL_QUERY);
        }

        return $uuids;
    }

    // Proves: reassign changes the version.
    public function test_reassigning_a_case_changes_the_version(): void
    {
        $assignment = $this->assign();
        $other = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $before = $this->sync()['version'];

        Sanctum::actingAs($this->reviewer);
        $this->patchJson("/api/v1/reports/{$assignment->report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $other->uuid,
            'expected_version' => $assignment->report->fresh()->lock_version,
        ])->assertOk();

        $this->assertNotSame($before, $this->sync()['version']);
        $this->assertSame(1, $this->sync(as: $other)['total']);
    }

    // Proves: unassign changes the version.
    public function test_unassigning_a_case_changes_the_version(): void
    {
        $assignment = $this->assign();
        $this->assign();
        $before = $this->sync()['version'];

        Sanctum::actingAs($this->reviewer);
        $this->patchJson("/api/v1/reports/{$assignment->report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'field_validation_assignee_uuid' => null,
            'expected_version' => $assignment->report->fresh()->lock_version,
        ])->assertOk();

        $after = $this->sync();
        $this->assertNotSame($before, $after['version']);
        $this->assertSame(1, $after['total']);
    }

    // Proves: close changes the version.
    public function test_closing_a_case_changes_the_version(): void
    {
        $assignment = $this->assign();
        $before = $this->sync()['version'];

        $assignment->report->update(['case_state' => Report::CASE_STATE_CLOSED]);

        $this->assertNotSame($before, $this->sync()['version']);
    }

    // Proves: edit changes the version.
    public function test_editing_case_information_changes_the_version(): void
    {
        $assignment = $this->assign();
        $before = $this->sync()['version'];

        $assignment->report->update(['barangay' => 'Corrected Barangay']);

        $this->assertNotSame($before, $this->sync()['version']);
    }

    // Proves: a closed previous visit still drives the version.
    public function test_editing_a_closed_previous_visit_changes_the_version(): void
    {
        $previousReport = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Mabini',
            'farmer_or_farm_owner_name' => 'Farm Alpha',
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RSSI,
            'case_state' => Report::CASE_STATE_CLOSED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
        ]);
        $previousAssignment = FieldValidationAssignment::factory()->create([
            'report_id' => $previousReport->getKey(),
            'assignee_id' => $this->inspector->getKey(),
            'assigned_by_id' => $this->reviewer->getKey(),
        ]);
        FieldValidationCompletion::factory()->create([
            'assignment_id' => $previousAssignment->getKey(),
            'visited_at' => '2026-09-10T08:30:00.000Z',
        ]);
        $this->assign(report: [
            'barangay' => 'mabini',
            'farmer_or_farm_owner_name' => 'farm alpha',
        ]);

        $before = $this->sync();
        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $this->assertSame(
            Report::AUTHORITY_CONDITION_RSSI,
            $this->getJson('/api/v1/mobile/assignments')->assertOk()
                ->json('data.0.previous_visit.authority_classified_condition'),
        );

        $previousReport->update(['authority_classified_condition' => Report::AUTHORITY_CONDITION_RUST]);

        $this->assertNotSame($before['version'], $this->sync()['version']);
    }

    // Proves: a set that changes mid-download asks the phone to restart.
    public function test_a_set_that_changes_mid_download_requires_a_restart(): void
    {
        $assignments = [$this->assign(), $this->assign(), $this->assign()];

        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $first = $this->getJson('/api/v1/mobile/assignments?limit=2&per_page=1')->assertOk();
        $next = $first->json('links.next');
        $this->assertNotNull($next);
        $nextPath = parse_url($next, PHP_URL_PATH).'?'.parse_url($next, PHP_URL_QUERY);
        $this->assertStringContainsString('sync_version='.$first->json('sync.version'), $nextPath);

        $assignments[2]->report->update(['case_state' => Report::CASE_STATE_CLOSED]);

        $this->getJson($nextPath)
            ->assertStatus(409)
            ->assertJsonPath('code', 'SYNC_RESTART')
            ->assertJsonPath('sync.total', 2)
            ->assertJsonPath('sync.truncated', false)
            ->assertJsonPath('sync.unchanged', false);

        $this->getJson('/api/v1/mobile/assignments?limit=2&per_page=1')
            ->assertOk()
            ->assertJsonPath('sync.total', 2)
            ->assertJsonCount(1, 'data');
    }

    // Proves: data the feed withholds does not move the version.
    public function test_editing_data_the_feed_withholds_does_not_change_the_version(): void
    {
        $assignment = $this->assign();
        $before = $this->sync();

        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $case = $this->getJson('/api/v1/mobile/assignments')->assertOk()->json('data.0.case');
        $this->assertArrayNotHasKey('review_notes', $case);
        $this->assertArrayNotHasKey('image_path', $case);

        $assignment->report->update([
            'review_notes' => 'Internal office note',
        ]);

        $this->assertSame($before['version'], $this->sync()['version']);
    }

    // Proves: an unchanged set returns "unchanged".
    public function test_an_unchanged_set_answers_unchanged_with_no_rows(): void
    {
        $this->assign();
        $this->assign();
        $first = $this->sync();
        $this->assertFalse($first['unchanged']);

        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $response = $this->getJson('/api/v1/mobile/assignments?since='.$first['version'])->assertOk();

        $response->assertJsonCount(0, 'data');
        $this->assertTrue($response->json('sync.unchanged'));
        $this->assertSame($first['version'], $response->json('sync.version'));
        $this->assertSame(2, $response->json('sync.total'));

        $this->assign();
        $stale = $this->getJson('/api/v1/mobile/assignments?since='.$first['version'])->assertOk();
        $this->assertFalse($stale->json('sync.unchanged'));
        $this->assertCount(3, $stale->json('data'));
    }

    // Proves: a bounded feed is cut by priority and reports the full total.
    public function test_a_bounded_feed_is_cut_by_priority_and_reports_the_full_total(): void
    {
        $completed = $this->assign(
            report: ['field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED],
            assignment: ['target_visit_date' => null],
        );
        $later = $this->assign(assignment: ['target_visit_date' => '2026-11-20']);
        $earlier = $this->assign(assignment: ['target_visit_date' => '2026-11-01']);
        $undated = $this->assign(assignment: ['target_visit_date' => null]);

        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $page = $this->getJson('/api/v1/mobile/assignments?limit=2')->assertOk();
        $sync = $page->json('sync');

        $this->assertSame(4, $sync['total']);
        $this->assertTrue($sync['truncated']);
        $this->assertEqualsCanonicalizing([$earlier->uuid, $later->uuid], array_column($page->json('data'), 'uuid'));
        $this->assertNotContains($completed->uuid, array_column($page->json('data'), 'uuid'));
        $this->assertNotContains($undated->uuid, array_column($page->json('data'), 'uuid'));
    }

    // Proves: an unbounded feed still delivers every row to older builds.
    public function test_an_unbounded_feed_delivers_every_row_above_the_documented_maximum(): void
    {
        // The published v1 contract honours at most 300 rows per bounded feed.
        $cap = 300;
        $completed = $this->assign(
            report: ['field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED],
            assignment: ['target_visit_date' => null],
        );
        $kept = [];
        for ($i = 0; $i < $cap; $i++) {
            $kept[] = $this->assign(assignment: [
                'target_visit_date' => null,
                'activated_at' => now()->subMinutes($cap - $i),
            ]);
        }
        $newest = $this->assign(assignment: ['target_visit_date' => null, 'activated_at' => now()]);

        $unbounded = $this->feedUuids('/api/v1/mobile/assignments?per_page=100');
        $this->assertCount($cap + 2, $unbounded);

        $bounded = $this->feedUuids('/api/v1/mobile/assignments?per_page=100&limit='.$cap);
        $this->assertCount($cap, $bounded);
        $this->assertNotContains($completed->uuid, $bounded);
        $this->assertNotContains($newest->uuid, $bounded);
        $this->assertContains($kept[0]->uuid, $bounded);
        $this->assertContains($kept[$cap - 1]->uuid, $bounded);

        $sync = $this->sync('?limit='.$cap);
        $this->assertSame($cap + 2, $sync['total']);
        $this->assertTrue($sync['truncated']);

        $before = $sync['version'];
        $completed->report->update(['barangay' => 'Corrected Barangay']);

        $this->assertNotSame($before, $this->sync('?limit='.$cap)['version']);
    }

    public function test_a_feed_within_the_requested_limit_is_not_truncated(): void
    {
        $this->assign();

        $sync = $this->sync('?limit=5');

        $this->assertSame(1, $sync['total']);
        $this->assertFalse($sync['truncated']);
    }

    // Proves: a bounded download that fits its bound is still version-bound.
    public function test_a_bounded_download_that_fits_its_bound_still_binds_every_page(): void
    {
        $this->assign();
        $this->assign();

        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $first = $this->getJson('/api/v1/mobile/assignments?limit=5&per_page=1')->assertOk();
        $this->assertFalse($first->json('sync.truncated'));
        $next = $first->json('links.next');
        $this->assertNotNull($next);
        $nextPath = parse_url($next, PHP_URL_PATH).'?'.parse_url($next, PHP_URL_QUERY);
        $this->assertStringContainsString('sync_version='.$first->json('sync.version'), $nextPath);

        $this->getJson($nextPath)->assertOk();

        FieldValidationAssignment::query()->first()->report->update(['barangay' => 'Corrected Barangay']);

        $this->getJson($nextPath)
            ->assertStatus(409)
            ->assertJsonPath('code', 'SYNC_RESTART');
    }

    // Proves: a bounded continuation must carry the version it started with.
    public function test_a_bounded_continuation_without_the_version_is_refused(): void
    {
        $this->assign();
        $this->assign();

        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $first = $this->getJson('/api/v1/mobile/assignments?limit=5&per_page=1')->assertOk();
        $next = $first->json('links.next');
        $this->assertNotNull($next);

        parse_str((string) parse_url($next, PHP_URL_QUERY), $query);
        unset($query['sync_version']);
        $withoutVersion = parse_url($next, PHP_URL_PATH).'?'.http_build_query($query);

        $this->getJson($withoutVersion)
            ->assertStatus(409)
            ->assertJsonPath('code', 'SYNC_RESTART');
    }

    // Proves: an unbounded continuation stays compatible with older builds.
    public function test_an_unbounded_continuation_is_not_version_bound(): void
    {
        $this->assign();
        $this->assign();

        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $first = $this->getJson('/api/v1/mobile/assignments?per_page=1')->assertOk();
        $next = $first->json('links.next');
        $this->assertNotNull($next);
        $nextPath = parse_url($next, PHP_URL_PATH).'?'.parse_url($next, PHP_URL_QUERY);

        FieldValidationAssignment::query()->first()->report->update(['barangay' => 'Corrected Barangay']);

        $this->getJson($nextPath)->assertOk();
    }

    // Proves: a legacy delta filter cannot narrow the snapshot.
    public function test_the_legacy_updated_after_filter_cannot_narrow_the_snapshot(): void
    {
        $this->assign();
        $this->assign();

        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $page = $this->getJson('/api/v1/mobile/assignments?updated_after='.now()->addMinute()->toISOString())
            ->assertOk();

        $this->assertCount(2, $page->json('data'));
        $this->assertSame(2, $page->json('sync.total'));
    }

    // Proves: previous-visit resolution does not add a query per row.
    public function test_previous_visit_resolution_queries_do_not_scale_with_the_row_count(): void
    {
        $this->assign();
        $this->assign();
        $twoRows = $this->feedQueryCount();

        for ($i = 0; $i < 6; $i++) {
            $this->assign();
        }

        $this->assertSame($twoRows, $this->feedQueryCount());
    }
}
