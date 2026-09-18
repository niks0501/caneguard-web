<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReviewReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_reviewer_can_persist_a_review_with_server_identity_and_time(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_assignee_uuid' => $report->reporter->uuid,
            'notes' => 'Inspect the field and compare visible symptoms.',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath(
                'data.review.status',
                Report::STATUS_FOR_FIELD_VALIDATION,
            )
            ->assertJsonPath('data.review.reviewer.uuid', $reviewer->uuid)
            ->assertJsonPath('data.version', 1);

        $report->refresh();

        $this->assertSame($reviewer->getKey(), $report->reviewer_id);
        $this->assertNotNull($report->reviewed_at);
        $this->assertSame(1, $report->lock_version);
        $this->assertSame(
            'Inspect the field and compare visible symptoms.',
            $report->review_notes,
        );
    }

    public function test_reviewer_can_persist_an_authority_classification_without_changing_model_evidence(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->mobileModelV1()->create([
            'predicted_label' => Report::LABEL_SMUT,
            'confidence' => 0.82,
        ]);
        $modelLabel = $report->predicted_label;
        $modelConfidence = $report->confidence;
        $modelScores = $report->classScores()->pluck('score', 'label')->all();

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_assignee_uuid' => $report->reporter->uuid,
            'notes' => 'Authority review requested for visible whip-like growth.',
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath(
                'data.review.authority_classified_condition',
                Report::AUTHORITY_CONDITION_SMUT,
            )
            ->assertJsonPath('data.model.predicted_label', $modelLabel)
            ->assertJsonPath('data.model.confidence', (float) $modelConfidence)
            ->assertJsonPath('data.review.reviewer.uuid', $reviewer->uuid);

        $updated = $report->fresh();
        $this->assertSame(Report::AUTHORITY_CONDITION_SMUT, $updated->authority_classified_condition);
        $this->assertSame(Report::LABEL_SMUT, $modelLabel);
        $this->assertSame($modelLabel, $updated->predicted_label);
        $this->assertSame($modelConfidence, $updated->confidence);
        $this->assertSame(
            $modelScores,
            $updated->classScores()->pluck('score', 'label')->all(),
        );
    }

    public function test_reviewer_can_preserve_a_historical_downy_mildew_classification(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->mobileModelV1()->create([
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.74,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_DOWNY_MILDEW,
        ]);
        $modelLabel = $report->predicted_label;
        $modelConfidence = $report->confidence;
        $modelScores = $report->classScores()->pluck('score', 'label')->all();

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_VERIFIED_BY_STAFF,
            'notes' => 'Preserve the historical Downy mildew finding independently of the model result.',
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_DOWNY_MILDEW,
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath(
                'data.review.authority_classified_condition',
                Report::AUTHORITY_CONDITION_DOWNY_MILDEW,
            )
            ->assertJsonPath('data.model.predicted_label', $modelLabel)
            ->assertJsonPath('data.model.confidence', (float) $modelConfidence);

        $updated = $report->fresh();
        $this->assertSame(Report::AUTHORITY_CONDITION_DOWNY_MILDEW, $updated->authority_classified_condition);
        $this->assertSame(Report::LABEL_RUST, $updated->predicted_label);
        $this->assertSame($modelLabel, $updated->predicted_label);
        $this->assertSame($modelConfidence, $updated->confidence);
        $this->assertSame($modelScores, $updated->classScores()->pluck('score', 'label')->all());
    }

    public function test_new_review_cannot_select_legacy_downy_mildew(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->mobileModelV1()->create([
            'predicted_label' => Report::LABEL_RUST,
        ]);

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_VERIFIED_BY_STAFF,
            'notes' => 'Downy mildew must not be offered for a new review.',
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_DOWNY_MILDEW,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('authority_classified_condition');

        $updated = $report->fresh();
        $this->assertNull($updated->authority_classified_condition);
        $this->assertSame(Report::STATUS_SUBMITTED_UNVERIFIED, $updated->review_status);
        $this->assertSame(Report::LABEL_RUST, $updated->predicted_label);
    }

    public function test_active_staff_classified_conditions_are_additive_and_preserve_submitted_evidence(): void
    {
        $reviewer = User::factory()->reviewer()->create();

        $this->assertSame([
            Report::AUTHORITY_CONDITION_HEALTHY,
            Report::AUTHORITY_CONDITION_SMUT,
            Report::AUTHORITY_CONDITION_MOSAIC,
            Report::AUTHORITY_CONDITION_RUST,
            Report::AUTHORITY_CONDITION_RSSI,
            Report::AUTHORITY_CONDITION_MIXED_OR_MULTIPLE,
            Report::AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY,
        ], Report::activeAuthorityClassifiedConditions());
        $this->assertSame(
            [Report::AUTHORITY_CONDITION_DOWNY_MILDEW],
            Report::legacyAuthorityClassifiedConditions(),
        );
        $this->assertSame(
            [
                ...Report::activeAuthorityClassifiedConditions(),
                ...Report::legacyAuthorityClassifiedConditions(),
            ],
            Report::authorityClassifiedConditions(),
        );

        Sanctum::actingAs($reviewer);

        foreach (Report::activeAuthorityClassifiedConditions() as $condition) {
            $report = Report::factory()->mobileModelV1()->create([
                'predicted_label' => Report::LABEL_RUST,
                'confidence' => 0.74,
                'farmer_or_farm_owner_name' => 'Juan Dela Cruz',
                'province' => 'Negros Occidental',
                'municipality' => 'Bago',
                'sugarcane_variety' => 'PSR 86',
                'crop_age' => '6 months',
                'cane_class' => 'Class A',
                'field_notes' => 'Observed at the eastern edge.',
                'reporter_suspected_condition' => 'rssi',
                'reporter_observation_text' => 'Rust-like symptoms were observed in the field.',
                'final_latitude' => 10.1234567,
                'final_longitude' => 122.9876543,
                'location_source' => 'gps',
                'gps_accuracy' => 4.25,
            ]);
            $modelEvidence = $this->immutableEvidenceSnapshot($report);
            $submittedObservationFields = [
                'farmer_or_farm_owner_name',
                'province',
                'municipality',
                'sugarcane_variety',
                'crop_age',
                'cane_class',
                'affected_area_hectares',
                'affected_portion_percent',
                'final_latitude',
                'final_longitude',
                'location_source',
                'gps_accuracy',
            ];
            $submittedObservations = $this->submittedObservationSnapshot(
                $report,
                $submittedObservationFields,
            );
            $modelScores = $report->classScores()->pluck('score', 'label')->all();
            $submittedSymptoms = $report->symptoms()->pluck('symptom_key')->all();

            $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
                'status' => Report::STATUS_VERIFIED_BY_STAFF,
                'notes' => "Staff classification recorded as {$condition}.",
                'authority_classified_condition' => $condition,
                'expected_version' => 0,
            ])
                ->assertOk()
                ->assertJsonPath('data.review.authority_classified_condition', $condition)
                ->assertJsonPath('data.model.predicted_label', Report::LABEL_RUST)
                ->assertJsonPath('data.model.confidence', 0.74);

            $updated = $report->fresh();
            $this->assertSame($condition, $updated->authority_classified_condition);
            $this->assertSame(Report::LABEL_RUST, $updated->predicted_label);
            $this->assertSame('0.7400000', $updated->confidence);
            $this->assertSame($modelEvidence, $this->immutableEvidenceSnapshot($updated));
            $this->assertSame(
                $submittedObservations,
                $this->submittedObservationSnapshot($updated, $submittedObservationFields),
            );
            $this->assertSame($modelScores, $updated->classScores()->pluck('score', 'label')->all());
            $this->assertSame($submittedSymptoms, $updated->symptoms()->pluck('symptom_key')->all());
        }
    }

    /**
     * SQLite drivers may return a whole-number DECIMAL as an int after a
     * reload, while the factory-created model retains the float input.
     * Normalize numeric evidence before comparing persistence invariants.
     *
     * @param  array<int, string>  $attributes
     * @return array<string, mixed>
     */
    private function submittedObservationSnapshot(Report $report, array $attributes): array
    {
        return collect($attributes)
            ->mapWithKeys(fn (string $attribute) => [
                $attribute => $this->canonicalObservationValue(
                    $attribute,
                    $report->getRawOriginal($attribute),
                ),
            ])
            ->all();
    }

    private function immutableEvidenceSnapshot(Report $report): array
    {
        return collect(Report::immutableEvidenceAttributes())
            ->mapWithKeys(fn (string $attribute) => [
                $attribute => $this->canonicalObservationValue(
                    $attribute,
                    $report->getRawOriginal($attribute),
                ),
            ])
            ->all();
    }

    private function canonicalObservationValue(string $attribute, mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }

        return in_array($attribute, [
            'affected_area_hectares',
            'affected_portion_percent',
            'final_latitude',
            'final_longitude',
            'gps_accuracy',
            'confidence',
            'preprocess_ms',
            'inference_ms',
            'total_ms',
        ], true) ? (float) $value : $value;
    }

    public function test_review_without_classification_preserves_an_existing_authority_finding(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
        ]);

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_VERIFIED_BY_STAFF,
            'notes' => 'Retain the reviewed authority finding.',
            'expected_version' => 0,
        ])->assertOk()
            ->assertJsonPath(
                'data.review.authority_classified_condition',
                Report::AUTHORITY_CONDITION_SMUT,
            );

        $this->assertSame(
            Report::AUTHORITY_CONDITION_SMUT,
            $report->fresh()->authority_classified_condition,
        );
    }

    public function test_authority_classification_uses_only_the_server_owned_allowlist(): void
    {
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $report = Report::factory()->create();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_RESOLVED,
            'notes' => 'No supported authority condition could be recorded.',
            'authority_classified_condition' => 'not-a-condition',
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('authority_classified_condition');

        $this->assertNull($report->fresh()->authority_classified_condition);
    }

    public function test_unable_to_verify_can_keep_authority_classification_null(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_UNABLE_TO_VERIFY,
            'notes' => 'The submitted image does not provide enough evidence.',
            'authority_classified_condition' => null,
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.review.authority_classified_condition', null)
            ->assertJsonPath('data.review.status', Report::STATUS_UNABLE_TO_VERIFY);
    }

    public function test_admin_can_mutate_a_report_review(): void
    {
        $admin = User::factory()->admin()->create();
        $report = Report::factory()->create();

        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_RESOLVED,
            'notes' => 'Resolved by the authority team.',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.review.status', Report::STATUS_RESOLVED)
            ->assertJsonPath('data.review.reviewer.uuid', $admin->uuid)
            ->assertJsonPath('data.version', 1);

        $this->assertDatabaseHas('reports', [
            'uuid' => $report->uuid,
            'review_status' => Report::STATUS_RESOLVED,
            'reviewer_id' => $admin->getKey(),
            'lock_version' => 1,
        ]);
    }

    public function test_unauthenticated_user_cannot_review_a_report(): void
    {
        $report = Report::factory()->create();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_RESOLVED,
            'notes' => 'Unauthenticated change.',
            'expected_version' => 0,
        ])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');
    }

    public function test_admin_can_review_another_reporter_owned_report_but_cannot_spoof_identity(): void
    {
        $admin = User::factory()->admin()->create();
        $reporter = User::factory()->fieldReporter()->create();
        $spoofedReviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create(['reporter_id' => $reporter]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_VERIFIED_BY_STAFF,
            'notes' => 'Reviewed by the authority team.',
            'expected_version' => 0,
            'reviewer_id' => $spoofedReviewer->getKey(),
            'reporter_id' => $admin->getKey(),
        ])
            ->assertOk()
            ->assertJsonPath('data.review.reviewer.uuid', $admin->uuid);

        $this->assertDatabaseHas('reports', [
            'uuid' => $report->uuid,
            'reporter_id' => $reporter->getKey(),
            'reviewer_id' => $admin->getKey(),
        ]);
    }

    public function test_field_reporter_cannot_review_a_report(): void
    {
        $fieldReporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create();

        Sanctum::actingAs($fieldReporter);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_RESOLVED,
            'notes' => 'Unauthorized change.',
            'expected_version' => 0,
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        $this->assertSame(
            Report::STATUS_SUBMITTED_UNVERIFIED,
            $report->fresh()->review_status,
        );
    }

    public function test_review_validation_uses_the_canonical_error_shape(): void
    {
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $report = Report::factory()->create();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => 'not-a-status',
            'notes' => str_repeat('x', 1001),
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => 'The given data was invalid.',
                'code' => 'VALIDATION_ERROR',
                'errors' => [
                    'status' => ['The selected status is invalid.'],
                    'notes' => [
                        'The notes field must not be greater than 1000 characters.',
                    ],
                ],
            ]);
    }

    public function test_unable_to_verify_requires_a_note(): void
    {
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $report = Report::factory()->create();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_UNABLE_TO_VERIFY,
            'notes' => '',
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('notes');
    }

    public function test_review_status_is_persisted_and_reloaded_as_the_mobile_snapshot(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $reporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'reporter_id' => $reporter,
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            'lock_version' => 0,
        ]);
        Sanctum::actingAs($reviewer);

        $response = $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_assignee_uuid' => $reporter->uuid,
            'notes' => 'Persist this exact current note.',
            'expected_version' => 0,
        ])->assertOk();

        $updated = $report->fresh();
        $this->assertSame(Report::STATUS_FOR_FIELD_VALIDATION, $updated->review_status);
        $this->assertSame('Persist this exact current note.', $updated->review_notes);
        $this->assertSame($reviewer->getKey(), $updated->reviewer_id);
        $this->assertNotNull($updated->reviewed_at);
        $this->assertTrue($updated->updated_at->greaterThanOrEqualTo($updated->reviewed_at));
        $this->assertSame(1, $updated->lock_version);
        $this->assertSame($updated->uuid, $response->json('data.identity.uuid'));
        $this->assertSame($updated->lock_version, $response->json('data.version'));

        $statusToken = $reporter->createToken('persisted-status-test', ['report:status'])->plainTextToken;
        Auth::forgetGuards();
        Auth::shouldUse('web');
        $this->flushHeaders();
        $mobile = $this->withToken($statusToken)
            ->getJson('/api/v1/mobile/reports/statuses?sync_before='
                .urlencode($updated->updated_at->addSecond()->toISOString()))
            ->assertOk();

        $this->assertSame([
            'uuid' => $updated->uuid,
            'client_uuid' => $updated->client_uuid,
            'reference_code' => $updated->reference_code,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'review_notes' => 'Persist this exact current note.',
            'reviewed_at' => $updated->reviewed_at->utc()->toISOString(),
            'updated_at' => $updated->updated_at->utc()->toISOString(),
        ], $mobile->json('data.0'));
        $this->assertArrayNotHasKey('reviewer_id', $mobile->json('data.0'));
        $this->assertArrayNotHasKey('reviewer', $mobile->json('data.0'));
    }

    public function test_reviewer_can_record_independent_lifecycle_decisions_and_audited_corrections(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'barangay' => 'Mabini',
            'farmer_or_farm_owner_name' => 'Original Farmer',
            'affected_area_hectares' => 10.5,
        ]);

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'case_state' => Report::CASE_STATE_OPEN,
            'notes' => 'Advisory provided while the case remains open for monitoring.',
            'metadata_corrections' => [
                'barangay' => 'Poblacion',
                'farmer_or_farm_owner_name' => 'Corrected Farmer',
                'affected_area_hectares' => 12.25,
            ],
            'correction_reason' => 'The submitted location sheet contained a transcription error.',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_OPEN)
            ->assertJsonPath(
                'data.lifecycle.verification_outcome',
                Report::VERIFICATION_OUTCOME_VERIFIED,
            )
            ->assertJsonPath('data.review.action_taken', Report::ACTION_ADVISORY_PROVIDED)
            ->assertJsonPath('data.review.status', Report::STATUS_SUBMITTED_UNVERIFIED)
            ->assertJsonPath('data.version', 1)
            ->assertJsonPath('data.audit.metadata_corrections.0.actor.uuid', $reviewer->uuid);

        $updated = $report->fresh();
        $this->assertSame(Report::CASE_STATE_OPEN, $updated->case_state);
        $this->assertSame(Report::VERIFICATION_OUTCOME_VERIFIED, $updated->verification_outcome);
        $this->assertSame(Report::ACTION_ADVISORY_PROVIDED, $updated->action_taken);
        $this->assertSame(Report::STATUS_SUBMITTED_UNVERIFIED, $updated->review_status);
        $this->assertSame('Poblacion', $updated->barangay);
        $this->assertSame('Corrected Farmer', $updated->farmer_or_farm_owner_name);
        $this->assertSame('12.25', $updated->affected_area_hectares);

        $audits = $updated->audits()->with('actor')->get();
        $this->assertCount(3, $audits);
        $barangayAudit = $audits->firstWhere('field', 'barangay');
        $this->assertNotNull($barangayAudit);
        $this->assertSame('Mabini', $barangayAudit->original_value);
        $this->assertSame('Poblacion', $barangayAudit->corrected_value);
        $this->assertSame($reviewer->getKey(), $barangayAudit->actor_id);
        $this->assertSame(
            'The submitted location sheet contained a transcription error.',
            $barangayAudit->reason,
        );
        $this->assertNotNull($barangayAudit->created_at);
    }

    public function test_verification_does_not_close_a_case_until_closure_is_explicit(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_OPEN)
            ->assertJsonPath('data.lifecycle.verification_outcome', Report::VERIFICATION_OUTCOME_VERIFIED)
            ->assertJsonPath('data.review.status', Report::STATUS_SUBMITTED_UNVERIFIED);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'case_state' => Report::CASE_STATE_CLOSED,
            'expected_version' => 1,
        ])
            ->assertOk()
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_CLOSED)
            ->assertJsonPath('data.lifecycle.verification_outcome', Report::VERIFICATION_OUTCOME_VERIFIED)
            ->assertJsonPath('data.review.status', Report::STATUS_VERIFIED_BY_STAFF);
    }

    public function test_review_requires_an_explicit_field_and_does_not_default_to_verification(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();

        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('review');

        $this->assertSame(Report::VERIFICATION_OUTCOME_NOT_DETERMINED, $report->fresh()->verification_outcome);
        $this->assertNull($report->fresh()->action_taken);
    }

    public function test_field_reporter_cannot_submit_an_independent_final_disposition(): void
    {
        $fieldReporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create();

        Sanctum::actingAs($fieldReporter);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'case_state' => Report::CASE_STATE_CLOSED,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'action_taken' => Report::ACTION_NO_FURTHER_ACTION_REQUIRED,
            'expected_version' => 0,
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        $this->assertSame(Report::CASE_STATE_OPEN, $report->fresh()->case_state);
    }

    public function test_synchronized_report_evidence_and_nested_observations_are_immutable(): void
    {
        $report = Report::factory()->create([
            'predicted_label' => Report::LABEL_RUST,
        ]);
        $score = $report->classScores()->firstOrFail();
        $symptom = $report->symptoms()->firstOrFail();

        try {
            $report->update(['predicted_label' => Report::LABEL_MOSAIC]);
            $this->fail('Expected the submitted model result to be immutable.');
        } catch (\LogicException) {
            $this->addToAssertionCount(1);
        }

        try {
            $score->update(['score' => 0.01]);
            $this->fail('Expected the submitted class score to be immutable.');
        } catch (\LogicException) {
            $this->addToAssertionCount(1);
        }

        try {
            $symptom->delete();
            $this->fail('Expected the submitted symptom observation to be immutable.');
        } catch (\LogicException) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_stale_review_is_rejected_without_overwriting_changes(): void
    {
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $report = Report::factory()->create();
        $report->refresh();
        $staleVersion = $report->lock_version;
        $report->update([
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'review_notes' => 'A newer review.',
            'lock_version' => $staleVersion + 1,
        ]);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_RESOLVED,
            'notes' => 'Overwrite attempt.',
            'expected_version' => $staleVersion,
        ])
            ->assertConflict()
            ->assertJsonPath('code', 'CONFLICT');

        $this->assertSame(
            'A newer review.',
            $report->fresh()->review_notes,
        );
    }

    public function test_review_remains_available_when_optional_review_history_table_is_missing(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        Schema::dropIfExists('report_review_events');
        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'notes' => 'Review remains available without optional history.',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.review.action_taken', Report::ACTION_ADVISORY_PROVIDED)
            ->assertJsonMissingPath('data.review_events');

        $this->assertDatabaseHas('reports', [
            'id' => $report->getKey(),
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'review_notes' => 'Review remains available without optional history.',
        ]);
    }

    public function test_review_persists_review_event_history_and_projects_latest_state(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();

        Sanctum::actingAs($reviewer);

        $firstResponse = $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'notes' => 'First review notes by staff.',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonCount(1, 'data.review_events')
            ->assertJsonPath('data.review_events.0.actor.uuid', $reviewer->uuid)
            ->assertJsonPath('data.review_events.0.authority_classified_condition', Report::AUTHORITY_CONDITION_SMUT)
            ->assertJsonPath('data.review_events.0.verification_outcome', Report::VERIFICATION_OUTCOME_VERIFIED)
            ->assertJsonPath('data.review_events.0.action_taken', Report::ACTION_ADVISORY_PROVIDED)
            ->assertJsonPath('data.review_events.0.notes', 'First review notes by staff.');

        $secondReviewer = User::factory()->reviewer()->create();
        Sanctum::actingAs($secondReviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'action_taken' => Report::ACTION_NO_FURTHER_ACTION_REQUIRED,
            'notes' => 'Second review note: case resolved.',
            'expected_version' => 1,
        ])
            ->assertOk()
            ->assertJsonCount(2, 'data.review_events')
            ->assertJsonPath('data.review_events.0.actor.uuid', $secondReviewer->uuid)
            ->assertJsonPath('data.review_events.0.notes', 'Second review note: case resolved.')
            ->assertJsonPath('data.review_events.1.actor.uuid', $reviewer->uuid)
            ->assertJsonPath('data.review_events.1.notes', 'First review notes by staff.');

        $this->assertDatabaseCount('report_review_events', 2);
        $report->refresh();
        $this->assertSame('Second review note: case resolved.', $report->review_notes);
        $this->assertSame(Report::ACTION_NO_FURTHER_ACTION_REQUIRED, $report->action_taken);
    }
}
