<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\MobileFieldValidationAssignmentController;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    private function assign(?User $assignee = null, array $report = []): FieldValidationAssignment
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create($report + [
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);

        return FieldValidationAssignment::factory()->create([
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
        $first = $this->getJson('/api/v1/mobile/assignments?per_page=2')->assertOk();
        $next = $first->json('links.next');
        $this->assertNotNull($next);
        $nextPath = parse_url($next, PHP_URL_PATH).'?'.parse_url($next, PHP_URL_QUERY);
        $this->assertStringContainsString('sync_version='.$first->json('sync.version'), $nextPath);

        $assignments[2]->report->update(['case_state' => Report::CASE_STATE_CLOSED]);

        $this->getJson($nextPath)
            ->assertStatus(409)
            ->assertJsonPath('code', 'SYNC_RESTART')
            ->assertJsonPath('sync.total', 2)
            ->assertJsonPath('sync.truncated', false);

        $this->getJson('/api/v1/mobile/assignments?per_page=2')
            ->assertOk()
            ->assertJsonPath('sync.total', 2)
            ->assertJsonCount(2, 'data');
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

    // Proves: an oversized set shows "N of M" instead of failing.
    public function test_an_oversized_set_is_capped_with_total_and_priority_order(): void
    {
        $cap = MobileFieldValidationAssignmentController::WORK_SET_CAP;
        $completed = $this->assign(report: ['field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED]);
        for ($i = 0; $i < $cap + 1; $i++) {
            $this->assign();
        }

        Sanctum::actingAs($this->inspector, ['assignment:read']);
        $uuids = [];
        $url = '/api/v1/mobile/assignments?per_page=100';
        $sync = null;
        while ($url !== null) {
            $page = $this->getJson($url)->assertOk();
            $sync ??= $page->json('sync');
            array_push($uuids, ...array_column($page->json('data'), 'uuid'));
            $next = $page->json('links.next');
            $url = $next === null ? null : parse_url($next, PHP_URL_PATH).'?'.parse_url($next, PHP_URL_QUERY);
        }

        $this->assertSame($cap + 2, $sync['total']);
        $this->assertTrue($sync['truncated']);
        $this->assertCount($cap, $uuids);
        $this->assertNotContains($completed->uuid, $uuids);

        $before = $sync['version'];
        $completed->report->update(['barangay' => 'Corrected Barangay']);

        $this->assertNotSame($before, $this->sync()['version']);
    }

    public function test_a_set_within_the_cap_is_not_truncated(): void
    {
        $this->assign();

        $sync = $this->sync();

        $this->assertSame(1, $sync['total']);
        $this->assertFalse($sync['truncated']);
    }
}
