<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * PROTECTED CONTRACT TESTS - reviewer queue filters.
 *
 * Contract source: .lavish/table-queue-board.html section 2 (filter bar),
 * section 6 ("Filters: Status, Barangay, Condition, Date, Reviewer (+ sort).
 * Four lifecycle filters collapse into Status; nothing else added.") and the
 * section 7 rulings:
 *   A3 - the Reviewer filter scopes by the field-validation assignee.
 *   A4 - two condition controls (predicted_label + authority_classified_condition).
 *   A5 - From/To on the submitted date and a new `workflow_status` parameter
 *        carrying the six workflow states.
 *
 * Baseline expectation: fails at revision 0cea13e because no register query
 * understands `workflow_status` (it is silently ignored, so every case is
 * returned and an unknown value is accepted) and no register query scopes by
 * reviewer/assignee.
 */
class TableQueueFilterContractTest extends TestCase
{
    use RefreshDatabase;

    private const WORKFLOW_STATUS_PARAM = 'workflow_status';

    private const REVIEWER_PARAM = 'reviewer';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    private function reviewer(): User
    {
        return User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
    }

    private function officer(string $name): User
    {
        return User::factory()
            ->inDistrict($this->pilotDistrict())
            ->fieldReporter()
            ->create(['name' => $name]);
    }

    private function lifecycleReport(array $attributes = []): Report
    {
        return Report::factory()->inDistrict($this->pilotDistrict())->create(array_merge([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
            'first_reviewed_at' => null,
        ], $attributes));
    }

    /**
     * One case per workflow state, each matching exactly one filter value.
     *
     * @return array<string, Report>
     */
    private function oneCasePerState(): array
    {
        $officer = $this->officer('Officer One');

        $needsReview = $this->lifecycleReport();
        $underReview = $this->lifecycleReport(['first_reviewed_at' => now()]);
        $fieldValidation = $this->lifecycleReport([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $fieldValidation->id,
            'assignee_id' => $officer->id,
        ]);
        $referred = $this->lifecycleReport([
            'referral_state' => Report::REFERRAL_STATE_REFERRED,
        ]);
        $resolved = $this->lifecycleReport([
            'case_state' => Report::CASE_STATE_CLOSED,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
        ]);

        return [
            'needs_review' => $needsReview,
            'under_review' => $underReview,
            'field_validation' => $fieldValidation,
            'referred' => $referred,
            'resolved' => $resolved,
        ];
    }

    public function test_workflow_status_filter_selects_exactly_the_matching_state(): void
    {
        Sanctum::actingAs($this->reviewer());
        $cases = $this->oneCasePerState();

        foreach ($cases as $state => $expected) {
            $this->getJson('/api/v1/reports?'.http_build_query([
                self::WORKFLOW_STATUS_PARAM => $state,
            ]))
                ->assertOk()
                ->assertJsonCount(1, 'data')
                ->assertJsonPath('data.0.uuid', $expected->uuid);
        }
    }

    public function test_workflow_status_filter_selects_follow_up_from_the_scheduled_revisit_flag(): void
    {
        Sanctum::actingAs($this->reviewer());
        $followUp = $this->lifecycleReport([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
            'scheduled_revisit' => true,
        ]);
        $this->lifecycleReport([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
            'scheduled_revisit' => false,
        ]);

        $this->getJson('/api/v1/reports?'.http_build_query([
            self::WORKFLOW_STATUS_PARAM => 'follow_up',
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $followUp->uuid);
    }

    public function test_workflow_status_filter_rejects_an_unknown_value(): void
    {
        Sanctum::actingAs($this->reviewer());

        $this->getJson('/api/v1/reports?'.http_build_query([
            self::WORKFLOW_STATUS_PARAM => 'not_a_workflow_state',
        ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(self::WORKFLOW_STATUS_PARAM);
    }

    public function test_reviewer_filter_scopes_the_queue_to_the_assignee(): void
    {
        Sanctum::actingAs($this->reviewer());
        $officer = $this->officer('Officer One');
        $assigned = $this->lifecycleReport([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $assigned->id,
            'assignee_id' => $officer->id,
        ]);
        $other = $this->lifecycleReport([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $other->id,
            'assignee_id' => $this->officer('Officer Two')->id,
        ]);

        $this->getJson('/api/v1/reports?'.http_build_query([
            self::REVIEWER_PARAM => $officer->uuid,
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $assigned->uuid)
            ->assertJsonMissing(['uuid' => $other->uuid]);
    }

    public function test_reviewer_filter_rejects_an_unknown_reviewer(): void
    {
        Sanctum::actingAs($this->reviewer());

        $this->getJson('/api/v1/reports?'.http_build_query([
            self::REVIEWER_PARAM => '00000000-0000-4000-8000-000000000000',
        ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(self::REVIEWER_PARAM);
    }
}
