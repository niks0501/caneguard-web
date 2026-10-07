<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * PROTECTED CONTRACT TESTS - every case surface carries the six queue columns.
 *
 * Contract source: .lavish/table-queue-board.html section 1 ("every case surface
 * at once" - registers, dashboard, map table, and the four small lists) and
 * section 6 ("Row content: Register rows show exactly the six columns").
 *
 * The six columns are Case, Location, Possible Condition, Affected Area,
 * Case Status and Review. The Case Status column is derived from the lifecycle
 * dimensions plus the first-reviewed signal and the ratified scheduled-revisit
 * flag (section 7, Q7), so every payload that renders a queue row must carry
 * the same field set. The board's A7 ruling widens every case-surface payload;
 * the ReportListResource addition recorded in section 4 is only the first.
 *
 * Baseline expectation: fails at revision 0cea13e because the list payload has
 * no affected_area_hectares value and the map / field-validation-queue payloads
 * have no farm reference, first-reviewed signal, action taken or mismatch flag.
 */
class TableQueueSurfacePayloadContractTest extends TestCase
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

    private function queueReport(array $attributes = []): Report
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create(array_merge([
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
            'affected_area_hectares' => 2.4,
            'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
            'farmer_or_farm_owner_name' => 'Dela Cruz',
            'mismatch_reported' => true,
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'predicted_label' => Report::LABEL_RUST,
        ], $attributes));

        FieldValidationAssignment::factory()->create([
            'report_id' => $report->id,
            'assignee_id' => User::factory()
                ->inDistrict($this->pilotDistrict())
                ->fieldReporter()
                ->create()
                ->id,
            'target_visit_date' => '2026-08-20',
        ]);

        return $report->refresh();
    }

    /**
     * Column -> payload field map for a queue row.
     *
     * @return array<int, string>
     */
    private function requiredRowFields(): array
    {
        return [
            // Case
            'uuid',
            'reference_code',
            'farm_reference',
            'mismatch_reported',
            // Location
            'barangay',
            'province',
            'municipality',
            // Possible Condition
            'predicted_label',
            'authority_classified_condition',
            // Affected Area
            'affected_area_hectares',
            'affected_area_measurement',
            // Case Status
            'lifecycle',
            'first_reviewed_at',
            'action_taken',
            'scheduled_revisit',
            // Review
        ];
    }

    public function test_register_list_payload_supports_the_six_queue_columns(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->queueReport();

        $this->getJson('/api/v1/reports')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $report->uuid)
            ->assertJsonPath('data.0.affected_area_hectares', 2.4)
            ->assertJsonPath('data.0.farm_reference', 'Dela Cruz')
            ->assertJsonPath('data.0.mismatch_reported', true)
            ->assertJsonPath('data.0.lifecycle.field_validation_state', Report::FIELD_VALIDATION_STATE_ASSIGNED)
            ->assertJsonPath('data.0.action_taken', Report::ACTION_ADVISORY_PROVIDED)
            ->assertJsonStructure([
                'data' => [[
                    'uuid',
                    'reference_code',
                    'farm_reference',
                    'mismatch_reported',
                    'barangay',
                    'province',
                    'municipality',
                    'predicted_label',
                    'authority_classified_condition',
                    'affected_area_hectares',
                    'affected_area_measurement',
                    'lifecycle' => [
                        'case_state',
                        'verification_outcome',
                        'field_validation_state',
                        'referral_state',
                    ],
                    'first_reviewed_at',
                    'action_taken',
                    'scheduled_revisit',
                ]],
            ]);
    }

    public function test_map_payload_supports_the_six_queue_columns(): void
    {
        Sanctum::actingAs($this->reviewer());
        $this->queueReport();

        $this->getJson('/api/v1/reports/map')
            ->assertOk()
            ->assertJsonPath('features.0.properties.affected_area_hectares', 2.4)
            ->assertJsonPath('features.0.properties.farm_reference', 'Dela Cruz')
            ->assertJsonPath('features.0.properties.mismatch_reported', true)
            ->assertJsonStructure([
                'features' => [[
                    'properties' => [
                        'uuid',
                        'reference_code',
                        'farm_reference',
                        'mismatch_reported',
                        'barangay',
                        'province',
                        'municipality',
                        'predicted_label',
                        'authority_classified_condition',
                        'affected_area_hectares',
                        'affected_area_measurement',
                        'lifecycle' => [
                            'case_state',
                            'verification_outcome',
                            'field_validation_state',
                            'referral_state',
                        ],
                        'first_reviewed_at',
                        'action_taken',
                        'scheduled_revisit',
                    ],
                ]],
            ]);
    }

    public function test_field_validation_queue_payload_supports_the_six_queue_columns(): void
    {
        Sanctum::actingAs($this->reviewer());
        $this->queueReport();

        $this->getJson('/api/v1/reports/field-validation-queue')
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.affected_area_hectares', 2.4)
            ->assertJsonPath('data.items.0.farm_reference', 'Dela Cruz')
            ->assertJsonPath('data.items.0.mismatch_reported', true)
            ->assertJsonStructure([
                'data' => [
                    'items' => [[
                        'uuid',
                        'reference_code',
                        'farm_reference',
                        'mismatch_reported',
                        'barangay',
                        'province',
                        'municipality',
                        'predicted_label',
                        'authority_classified_condition',
                        'affected_area_hectares',
                        'affected_area_measurement',
                        'lifecycle' => [
                            'case_state',
                            'verification_outcome',
                            'field_validation_state',
                            'referral_state',
                        ],
                        'first_reviewed_at',
                        'action_taken',
                        'scheduled_revisit',
                    ]],
                ],
            ]);
    }

    public function test_every_case_surface_exposes_the_same_queue_column_fields(): void
    {
        Sanctum::actingAs($this->reviewer());
        $this->queueReport();

        $listRow = $this->getJson('/api/v1/reports')->json('data.0');
        $mapRow = $this->getJson('/api/v1/reports/map')->json('features.0.properties');
        $queueRow = $this->getJson('/api/v1/reports/field-validation-queue')->json('data.items.0');

        foreach ([
            'register list' => $listRow,
            'map' => $mapRow,
            'field-validation queue' => $queueRow,
        ] as $surface => $row) {
            $this->assertIsArray($row, "The {$surface} surface returned no queue row.");
            foreach ($this->requiredRowFields() as $field) {
                $this->assertArrayHasKey(
                    $field,
                    $row,
                    "The {$surface} surface is missing the {$field} field required by the six queue columns.",
                );
            }
        }
    }
}
