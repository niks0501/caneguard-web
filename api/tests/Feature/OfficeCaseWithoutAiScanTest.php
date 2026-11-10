<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Proposal tests (not proof): each states the intent requirement it covers.
 */
class OfficeCaseWithoutAiScanTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    /** Proves: an office row without AI data saves and reads back complete. */
    public function test_office_report_without_ai_data_saves_and_reads_back_complete(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->officeWithoutAiScan()->create();
        $fresh = Report::query()->findOrFail($report->getKey());

        $this->assertSame(Report::ORIGIN_OFFICE, $fresh->origin);
        $this->assertNull($fresh->predicted_label);
        $this->assertNull($fresh->confidence);
        $this->assertNull($fresh->image_path);
        $this->assertFalse($fresh->hasAiScan());
        $this->assertSame(1, Report::query()->withoutAiScan()->count());

        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());
        $this->getJson('/api/v1/reports/'.$fresh->uuid)
            ->assertOk()
            ->assertJsonPath('data.model.predicted_label', null)
            ->assertJsonPath('data.model.confidence', null)
            ->assertJsonPath('data.image.url', null);
        $this->getJson('/api/v1/reports')->assertOk()->assertJsonPath('data.0.image_url', null);
        $this->getJson('/api/v1/reports/'.$fresh->uuid.'/image')->assertNotFound();
    }

    /** Proves: charts show the no-AI bucket with correct counts; field rows unchanged. */
    public function test_analytics_counts_the_no_ai_bucket_without_touching_field_rows(): void
    {
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());
        $when = CarbonImmutable::parse('2026-09-03T02:00:00Z');
        Report::factory()->inDistrict($this->pilotDistrict())->create(['predicted_label' => Report::LABEL_RUST, 'submitted_at' => $when]);
        Report::factory()->count(2)->inDistrict($this->pilotDistrict())->officeWithoutAiScan()->create(['submitted_at' => $when]);

        $data = $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-07')->assertOk()->json('data');

        $this->assertSame(2, $data['no_ai_scan']);
        $this->assertContains(['condition' => Report::LABEL_RUST, 'count' => 1], $data['possible_condition']);
        $this->assertSame(1, array_sum(array_column($data['possible_condition'], 'count')));
        $this->assertSame(3, $data['total_submitted']);
    }

    /** Proves: the API exposes ?supports=no_ai_scan and old builds keep refreshing. */
    public function test_mobile_feed_delivers_scanless_rows_only_to_builds_that_ask(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $assignee = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $scanned = Report::factory()->inDistrict($this->pilotDistrict())->mobileModelV1()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $scanless = Report::factory()->inDistrict($this->pilotDistrict())->officeWithoutAiScan()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        foreach ([$scanned, $scanless] as $report) {
            FieldValidationAssignment::factory()->create([
                'report_id' => $report->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
            ]);
        }
        Sanctum::actingAs($assignee, ['assignment:read']);

        $old = $this->getJson('/api/v1/mobile/assignments')->assertOk();
        $old->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.report_uuid', $scanned->uuid)
            ->assertJsonPath('sync.total', 1);

        $new = $this->getJson('/api/v1/mobile/assignments?supports=no_ai_scan')->assertOk();
        $new->assertJsonCount(2, 'data')->assertJsonPath('sync.total', 2);
        $row = collect($new->json('data'))->firstWhere('report_uuid', $scanless->uuid);
        $this->assertNull($row['case']['predicted_label']);
        $this->assertNull($row['case']['confidence']);
        $this->assertNull($row['case']['photo']);
        $this->assertNotSame($old->json('sync.version'), $new->json('sync.version'));

        $this->getJson('/api/v1/mobile/assignments?supports=other')->assertUnprocessable();
    }
}
