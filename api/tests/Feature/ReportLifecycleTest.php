<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_lifecycle_dimensions_are_independent_and_available_to_web_clients(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
            'referral_state' => Report::REFERRAL_STATE_REFERRED,
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.review.status', Report::STATUS_SUBMITTED_UNVERIFIED)
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_OPEN)
            ->assertJsonPath(
                'data.lifecycle.verification_outcome',
                Report::VERIFICATION_OUTCOME_VERIFIED,
            )
            ->assertJsonPath(
                'data.lifecycle.field_validation_state',
                Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
            )
            ->assertJsonPath(
                'data.lifecycle.referral_state',
                Report::REFERRAL_STATE_REFERRED,
            )
            ->assertJsonPath('data.identity.client_uuid', $report->client_uuid)
            ->assertJsonPath('data.image.mime_type', $report->image_mime_type)
            ->assertJsonPath('data.model.predicted_label', $report->predicted_label)
            ->assertJsonPath(
                'data.timestamps.captured_at',
                $report->captured_at->utc()->toISOString(),
            )
            ->assertJsonPath(
                'data.review.authority_classified_condition',
                $report->authority_classified_condition,
            );
    }

    public function test_lifecycle_dimensions_are_included_in_list_map_and_field_validation_resources(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'referral_state' => Report::REFERRAL_STATE_REFERRED,
            'final_latitude' => 14.0667,
            'final_longitude' => 120.6319,
        ]);

        Sanctum::actingAs($reviewer);

        $expected = [
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'referral_state' => Report::REFERRAL_STATE_REFERRED,
        ];

        $this->getJson('/api/v1/reports?status='.Report::STATUS_FOR_FIELD_VALIDATION)
            ->assertOk()
            ->assertJsonPath('data.0.uuid', $report->uuid)
            ->assertJsonPath('data.0.lifecycle', $expected);

        $this->getJson('/api/v1/reports/field-validation-queue')
            ->assertOk()
            ->assertJsonPath('data.items.0.uuid', $report->uuid)
            ->assertJsonPath('data.items.0.lifecycle', $expected);

        $this->getJson('/api/v1/reports/map')
            ->assertOk()
            ->assertJsonPath('features.0.id', $report->uuid)
            ->assertJsonPath('features.0.properties.lifecycle', $expected);
    }

    public function test_legacy_status_mapping_keeps_active_cases_open_and_terminal_cases_closed(): void
    {
        $expected = [
            Report::STATUS_SUBMITTED_UNVERIFIED => [
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
            ],
            Report::STATUS_FOR_FIELD_VALIDATION => [
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
            ],
            Report::STATUS_VERIFIED_BY_STAFF => [
                'case_state' => Report::CASE_STATE_CLOSED,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
            ],
            Report::STATUS_UNABLE_TO_VERIFY => [
                'case_state' => Report::CASE_STATE_CLOSED,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
            ],
            Report::STATUS_RESOLVED => [
                'case_state' => Report::CASE_STATE_CLOSED,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
            ],
        ];

        foreach ($expected as $status => $lifecycle) {
            $this->assertSame(
                $lifecycle,
                Report::lifecycleForReviewStatus($status),
                "Unexpected lifecycle mapping for {$status}.",
            );
        }
    }

    public function test_legacy_status_review_updates_keep_the_lifecycle_compatibility_mapping_in_sync(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
        ]);

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_UNABLE_TO_VERIFY,
            'notes' => 'The evidence is insufficient for a conclusion.',
            'expected_version' => 0,
        ])->assertOk()
            ->assertJsonPath('data.review.status', Report::STATUS_UNABLE_TO_VERIFY)
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_CLOSED)
            ->assertJsonPath(
                'data.lifecycle.verification_outcome',
                Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY,
            );

        $updated = $report->fresh();
        $this->assertSame(Report::CASE_STATE_CLOSED, $updated->case_state);
        $this->assertSame(
            Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY,
            $updated->verification_outcome,
        );
    }

    public function test_legacy_status_review_updates_do_not_reset_other_lifecycle_dimensions(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
            'referral_state' => Report::REFERRAL_STATE_REFERRED,
        ]);

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_VERIFIED_BY_STAFF,
            'notes' => 'Record the legacy review outcome.',
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_RUST,
            'expected_version' => 0,
        ])->assertOk()
            ->assertJsonPath(
                'data.lifecycle.field_validation_state',
                Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
            )
            ->assertJsonPath(
                'data.lifecycle.referral_state',
                Report::REFERRAL_STATE_REFERRED,
            );

        $updated = $report->fresh();
        $this->assertSame(
            Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
            $updated->field_validation_state,
        );
        $this->assertSame(
            Report::REFERRAL_STATE_REFERRED,
            $updated->referral_state,
        );
    }
}
