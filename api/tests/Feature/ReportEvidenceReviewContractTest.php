<?php

namespace Tests\Feature;

use App\Models\Advisory;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * PROTECTED CONTRACT TESTS - Report Evidence Review.
 *
 * These tests encode system-wide invariants approved before implementation.
 * Do not weaken, delete, skip, or rewrite them merely to make an implementation
 * pass. Contract disagreements must return to specification.
 */
class ReportEvidenceReviewContractTest extends TestCase
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

    public function test_verified_requires_a_staff_classified_condition(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->report();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('authority_classified_condition');

        $report->refresh();
        $this->assertSame(Report::VERIFICATION_OUTCOME_NOT_DETERMINED, $report->verification_outcome);
        $this->assertNull($report->authority_classified_condition);
    }

    public function test_field_validation_cannot_be_recorded_as_verified_in_the_same_decision(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->report();
        $assignee = User::factory()
            ->inDistrict($this->pilotDistrict())
            ->fieldReporter()
            ->create();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $assignee->uuid,
            'case_state' => Report::CASE_STATE_OPEN,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('verification_outcome');

        $report->refresh();
        $this->assertSame(Report::VERIFICATION_OUTCOME_NOT_DETERMINED, $report->verification_outcome);
        $this->assertSame(Report::FIELD_VALIDATION_STATE_UNASSIGNED, $report->field_validation_state);
    }

    public function test_advisory_provided_requires_a_validated_advisory_selection(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->report();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('advisory_uuid');

        $this->assertNull($report->fresh()->action_taken);
    }

    public function test_technical_assistance_requires_meaningful_details(): void
    {
        Sanctum::actingAs($this->reviewer());

        foreach ([null, '', '   '] as $notes) {
            $report = $this->report();

            $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
                'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
                'notes' => $notes,
                'expected_version' => 0,
            ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('notes');

            $this->assertNull($report->fresh()->action_taken);
        }
    }

    public function test_support_action_preserves_existing_case_state_when_case_state_is_not_explicitly_changed(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->report([
            'case_state' => Report::CASE_STATE_CLOSED,
        ]);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
            'notes' => 'Recorded practical field support already delivered.',
            'expected_version' => 0,
        ])->assertOk();

        $report->refresh();
        $this->assertSame(Report::CASE_STATE_CLOSED, $report->case_state);
        $this->assertSame(Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED, $report->action_taken);
    }

    public function test_valid_advisory_guidance_maps_to_advisory_action_without_changing_case_state(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->report([
            'case_state' => Report::CASE_STATE_OPEN,
        ]);
        $advisory = Advisory::factory()->create([
            'status' => Advisory::STATUS_VALIDATED,
        ]);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'advisory_uuid' => $advisory->uuid,
            'expected_version' => 0,
        ])->assertOk();

        $report->refresh();
        $this->assertSame(Report::CASE_STATE_OPEN, $report->case_state);
        $this->assertSame(Report::ACTION_ADVISORY_PROVIDED, $report->action_taken);
        $this->assertSame($advisory->getKey(), $report->advisory_id);
    }
}
