<?php

namespace Tests\Feature;

use App\Actions\Reports\ExportReports;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * PROTECTED REGRESSION TESTS - existing queue behavior the redesign must not
 * change.
 *
 * Contract source: .lavish/table-queue-board.html section 4 ("Keep what works")
 * and section 6 ("No regressions ... keyboard row opening, queue context,
 * Review Next Case chain, paging, CSV richness, policy gates - all unchanged and
 * tested.").
 *
 * These tests pass at revision 0cea13e by design. They exist to fail loudly if
 * the redesign silently drops export richness, paging, duplicate exclusion,
 * queue predicates or policy gates. They belong with the implementation task,
 * not with the contract tests that must fail on baseline.
 */
class TableQueueRegressionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    private function reviewer(): User
    {
        return User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
    }

    private function report(array $attributes = []): Report
    {
        return Report::factory()->inDistrict($this->pilotDistrict())->create($attributes);
    }

    public function test_csv_export_keeps_all_twenty_four_case_columns(): void
    {
        $expected = [
            'case_reference',
            'submitted_date',
            'barangay',
            'farmer_or_farm_reference',
            'possible_ai_condition',
            'affected_area_hectares',
            'affected_area_measurement',
            'affected_portion_percent',
            'affected_portion_measurement',
            'work_status',
            'verification_outcome',
            'case_state',
            'field_validation_state',
            'staff_classified_condition',
            'location_unavailable',
            'location_unavailable_reason',
            'field_validator',
            'assigned_by',
            'target_visit_date',
            'action_taken',
            'referral_state',
            'referral_destination',
            'referral_reference',
            'referral_date',
        ];

        $this->assertSame($expected, ExportReports::HEADERS);

        Sanctum::actingAs($this->reviewer());
        $this->report();

        $csv = $this->get('/api/v1/reports/export')->assertOk()->streamedContent();
        $firstLine = strtok($csv, "\n");

        $this->assertSame($expected, str_getcsv($firstLine));
    }

    public function test_register_excludes_linked_duplicates(): void
    {
        Sanctum::actingAs($this->reviewer());
        $canonical = $this->report();
        $duplicate = $this->report(['canonical_report_id' => $canonical->id]);

        $this->getJson('/api/v1/reports')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $canonical->uuid)
            ->assertJsonMissing(['uuid' => $duplicate->uuid]);
    }

    public function test_register_keeps_fifteen_rows_per_page_and_queue_context_identity(): void
    {
        Sanctum::actingAs($this->reviewer());
        foreach (range(1, 17) as $index) {
            $this->report(['submitted_at' => now()->subMinutes($index)]);
        }

        $this->getJson('/api/v1/reports')
            ->assertOk()
            ->assertJsonCount(15, 'data')
            ->assertJsonPath('meta.per_page', 15)
            ->assertJsonPath('meta.total', 17)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonStructure(['data' => [['uuid', 'reference_code']]]);
    }

    public function test_operational_queue_predicates_are_unchanged(): void
    {
        Sanctum::actingAs($this->reviewer());
        $needsReview = $this->report([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
        ]);
        $this->report([
            'case_state' => Report::CASE_STATE_CLOSED,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
        ]);

        $this->getJson('/api/v1/reports?queue=needs_review')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $needsReview->uuid);
    }

    public function test_condition_filters_use_predicted_and_staff_classification(): void
    {
        Sanctum::actingAs($this->reviewer());
        $rust = $this->report([
            'barangay' => 'Balaytigui',
            'predicted_label' => Report::LABEL_RUST,
            'authority_classified_condition' => Report::LABEL_RUST,
        ]);
        $smut = $this->report([
            'barangay' => 'Balaytigui',
            'predicted_label' => Report::LABEL_SMUT,
            'authority_classified_condition' => Report::LABEL_SMUT,
        ]);

        $this->getJson('/api/v1/reports?'.http_build_query([
            'predicted_label' => Report::LABEL_RUST,
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $rust->uuid);

        $this->getJson('/api/v1/reports?'.http_build_query([
            'authority_classified_condition' => Report::LABEL_SMUT,
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $smut->uuid);
    }

    public function test_date_range_filters_on_the_submitted_date(): void
    {
        Sanctum::actingAs($this->reviewer());
        $inside = $this->report([
            'submitted_at' => CarbonImmutable::parse('2026-07-20T10:00:00Z'),
        ]);
        $outside = $this->report([
            'submitted_at' => CarbonImmutable::parse('2026-07-22T02:00:00Z'),
        ]);

        $this->getJson('/api/v1/reports?'.http_build_query([
            'date_from' => '2026-07-20',
            'date_to' => '2026-07-20',
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $inside->uuid)
            ->assertJsonMissing(['uuid' => $outside->uuid]);
    }

    public function test_queue_endpoints_require_web_access(): void
    {
        $this->getJson('/api/v1/reports')->assertUnauthorized();

        Sanctum::actingAs(
            User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create(),
        );
        $this->getJson('/api/v1/reports')->assertForbidden();
        $this->getJson('/api/v1/reports/map')->assertForbidden();
        $this->get('/api/v1/reports/export')->assertForbidden();
    }

    public function test_review_decision_still_stamps_first_reviewed_at_once(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->report();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'expected_version' => 0,
        ])->assertOk();

        $first = $report->fresh()->first_reviewed_at;
        $this->assertNotNull($first);

        $this->travel(5)->minutes();
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'expected_version' => 1,
        ])->assertOk();

        $this->assertTrue(
            $first->equalTo($report->fresh()->first_reviewed_at),
            'A later review must not move the first-reviewed timestamp.',
        );
    }
}
