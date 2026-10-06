<?php

namespace Tests\Feature;

use App\Models\Advisory;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportEvidenceReviewInvariantTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());
    }

    public function test_verified_can_use_an_existing_human_classification_but_cannot_clear_it(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RUST,
        ]);
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'expected_version' => 0,
        ])->assertOk();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'authority_classified_condition' => null,
            'expected_version' => 1,
        ])->assertUnprocessable()->assertJsonValidationErrors('authority_classified_condition');
        $this->assertSame(Report::AUTHORITY_CONDITION_RUST, $report->fresh()->authority_classified_condition);
    }

    public function test_assignment_without_an_explicit_verification_resets_a_previous_finding_to_not_determined(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RUST,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
        ]);
        $inspector = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $inspector->uuid,
            'expected_version' => 0,
        ])->assertOk()->assertJsonPath('data.lifecycle.verification_outcome', Report::VERIFICATION_OUTCOME_NOT_DETERMINED);
        $this->assertSame(Report::AUTHORITY_CONDITION_RUST, $report->fresh()->authority_classified_condition);
    }

    public function test_support_rejects_unicode_whitespace_and_unvalidated_guidance(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create();
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'action_taken' => Report::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
            'notes' => "\u{00A0}\u{2003}\t\n",
            'expected_version' => 0,
        ])->assertUnprocessable()->assertJsonValidationErrors('notes');

        foreach ([Advisory::STATUS_DRAFT, Advisory::STATUS_RETIRED] as $status) {
            $advisory = Advisory::factory()->create(['status' => $status]);
            $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
                'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
                'advisory_uuid' => $advisory->uuid,
                'expected_version' => 0,
            ])->assertUnprocessable()->assertJsonValidationErrors('advisory_uuid');
        }
        $this->assertSame(0, $report->fresh()->lock_version);
    }

    public function test_invalid_legacy_status_input_is_a_validation_error_not_a_server_error(): void
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create();
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => ['verified_by_staff'],
            'expected_version' => 0,
        ])->assertUnprocessable()->assertJsonValidationErrors('status');
    }
}
