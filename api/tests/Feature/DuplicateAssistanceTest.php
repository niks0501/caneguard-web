<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DuplicateAssistanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_mobile_possible_matches_require_same_condition_and_nearby_recent_location(): void
    {
        Storage::fake('local');
        $now = CarbonImmutable::parse('2026-08-29T10:00:00Z');
        CarbonImmutable::setTestNow($now);

        try {
            $reporter = User::factory()->fieldReporter()->create();
            $nearbySameCondition = Report::factory()->create([
                'predicted_label' => Report::LABEL_RUST,
                'final_latitude' => 14.0667000,
                'final_longitude' => 120.6319000,
                'submitted_at' => $now->subHours(2),
            ]);
            Report::factory()->create([
                'predicted_label' => Report::LABEL_MOSAIC,
                'final_latitude' => 14.0667000,
                'final_longitude' => 120.6319000,
                'submitted_at' => $now->subHours(1),
            ]);
            Report::factory()->create([
                'predicted_label' => Report::LABEL_RUST,
                'final_latitude' => 14.1000000,
                'final_longitude' => 120.6319000,
                'submitted_at' => $now->subHours(1),
            ]);
            Report::factory()->create([
                'predicted_label' => Report::LABEL_RUST,
                'final_latitude' => 14.0667000,
                'final_longitude' => 120.6319000,
                'submitted_at' => $now->subHours(73),
            ]);
            $token = $reporter->createToken('possible-match-test', ['report:submit'])
                ->plainTextToken;

            $this->withToken($token)
                ->getJson('/api/v1/mobile/reports/possible-matches?'.http_build_query([
                    'predicted_label' => Report::LABEL_RUST,
                    'final_latitude' => 14.0667001,
                    'final_longitude' => 120.6319001,
                ]))
                ->assertOk()
                ->assertJsonCount(1, 'data')
                ->assertJsonPath('data.0.case.uuid', $nearbySameCondition->uuid)
                ->assertJsonPath('data.0.match.condition', Report::LABEL_RUST)
                ->assertJsonPath('data.0.match.basis.0', 'same_condition')
                ->assertJsonPath('meta.possible_match', true)
                ->assertJsonPath('meta.can_submit', true)
                ->assertJsonPath('meta.assessment', 'condition_and_location')
                ->assertJsonPath('message', 'Possible recent matches found. You can still submit a new case.')
                ->assertJsonPath('data.0.message', 'Possible recent match. Compare this case before deciding.');

            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', $this->uploadPayload())
                ->assertCreated();

            $this->assertDatabaseCount('reports', 5);
            $this->assertSame(5, Report::query()->whereNull('canonical_report_id')->count());
            $this->assertDatabaseCount('report_audits', 0);
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_mobile_possible_matches_support_smut_model_labels(): void
    {
        $now = CarbonImmutable::parse('2026-08-29T10:00:00Z');
        CarbonImmutable::setTestNow($now);

        try {
            $reporter = User::factory()->fieldReporter()->create();
            $match = Report::factory()->mobileModelV1()->create([
                'predicted_label' => Report::LABEL_SMUT,
                'final_latitude' => 14.0667000,
                'final_longitude' => 120.6319000,
                'submitted_at' => $now->subHours(2),
            ]);
            $token = $reporter->createToken('smut-possible-match-test', ['report:submit'])
                ->plainTextToken;

            $this->withToken($token)
                ->getJson('/api/v1/mobile/reports/possible-matches?'.http_build_query([
                    'predicted_label' => Report::LABEL_SMUT,
                    'final_latitude' => 14.0667001,
                    'final_longitude' => 120.6319001,
                ]))
                ->assertOk()
                ->assertJsonCount(1, 'data')
                ->assertJsonPath('data.0.case.uuid', $match->uuid)
                ->assertJsonPath('data.0.match.condition', Report::LABEL_SMUT)
                ->assertJsonPath('meta.possible_match', true);
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_missing_location_returns_safe_no_match_assistance_without_blocking_submission_contract(): void
    {
        $reporter = User::factory()->fieldReporter()->create();
        $token = $reporter->createToken('missing-location-match-test', ['report:submit'])
            ->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/mobile/reports/possible-matches?'.http_build_query([
                'predicted_label' => Report::LABEL_RUST,
            ]))
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.possible_match', false)
            ->assertJsonPath('meta.can_submit', true)
            ->assertJsonPath('meta.assessment', 'location_unavailable')
            ->assertJsonPath('message', 'No possible recent match was found. You can still submit a new case.');
    }

    public function test_mobile_possible_matches_are_limited_to_field_reporters_with_submit_ability(): void
    {
        $this->getJson('/api/v1/mobile/reports/possible-matches?predicted_label=rust')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        $reviewer = User::factory()->reviewer()->create();
        Sanctum::actingAs($reviewer, ['report:submit']);

        $this->getJson('/api/v1/mobile/reports/possible-matches?predicted_label=rust')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_web_possible_matches_are_visible_to_reviewer_and_admin_but_not_field_reporters(): void
    {
        $report = Report::factory()->create([
            'predicted_label' => Report::LABEL_RUST,
            'final_latitude' => 14.0667000,
            'final_longitude' => 120.6319000,
        ]);

        Sanctum::actingAs(User::factory()->fieldReporter()->create());
        $this->getJson("/api/v1/reports/{$report->uuid}/possible-matches")
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->reviewer()->create());
        $this->getJson("/api/v1/reports/{$report->uuid}/possible-matches")
            ->assertOk()
            ->assertJsonPath('meta.possible_match', false)
            ->assertJsonPath('meta.can_submit', true);

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson("/api/v1/reports/{$report->uuid}/possible-matches")
            ->assertOk();
    }

    public function test_reviewer_can_link_a_duplicate_without_changing_evidence_or_lifecycle(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $canonical = Report::factory()->create([
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.91,
            'image_path' => 'reports/canonical-evidence.jpg',
        ]);
        $duplicate = Report::factory()->create([
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.73,
            'image_path' => 'reports/duplicate-evidence.jpg',
        ]);
        $canonicalEvidence = [
            'predicted_label' => $canonical->predicted_label,
            'confidence' => $canonical->confidence,
            'image_path' => $canonical->image_path,
            'review_status' => $canonical->review_status,
            'case_state' => $canonical->case_state,
        ];

        Sanctum::actingAs($reviewer);

        $response = $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
            'reason' => 'The submissions describe the same observed field condition.',
            'expected_version' => 0,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.identity.uuid', $duplicate->uuid)
            ->assertJsonPath('data.duplicate_linkage.is_duplicate', true)
            ->assertJsonPath('data.duplicate_linkage.canonical_case.uuid', $canonical->uuid)
            ->assertJsonPath('data.duplicate_linkage.canonical_case.reference_code', $canonical->reference_code)
            ->assertJsonPath('data.duplicate_linkage.linked_by.uuid', $reviewer->uuid)
            ->assertJsonPath('data.duplicate_linkage.reason', 'The submissions describe the same observed field condition.')
            ->assertJsonPath('data.audit.metadata_corrections', [])
            ->assertJsonPath('data.audit.duplicate_linkages.0.canonical_case_uuid', $canonical->uuid)
            ->assertJsonPath('data.version', 1);

        $this->assertDatabaseHas('reports', [
            'id' => $duplicate->id,
            'canonical_report_id' => $canonical->id,
            'lock_version' => 1,
            'case_state' => Report::CASE_STATE_OPEN,
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
        ]);
        $this->assertDatabaseCount('report_audits', 1);
        $audit = $duplicate->audits()->with('actor')->sole();
        $this->assertSame(Report::AUDIT_FIELD_CANONICAL_REPORT, $audit->field);
        $this->assertNull($audit->original_value);
        $this->assertSame($canonical->uuid, $audit->corrected_value);
        $this->assertSame($reviewer->getKey(), $audit->actor_id);
        $this->assertSame(
            'The submissions describe the same observed field condition.',
            $audit->reason,
        );

        $this->assertSame($canonicalEvidence, $canonical->fresh()->only(array_keys($canonicalEvidence)));

        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
            'expected_version' => 1,
        ])
            ->assertOk()
            ->assertJsonPath('data.version', 1);

        $this->assertDatabaseCount('report_audits', 1);
    }

    public function test_only_reviewer_or_admin_can_link_and_invalid_targets_are_rejected(): void
    {
        $canonical = Report::factory()->create();
        $duplicate = Report::factory()->create();

        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
            'expected_version' => 0,
        ])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());
        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
            'expected_version' => 0,
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->reviewer()->create());
        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $duplicate->uuid,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('canonical_report_uuid');

        $alreadyDuplicate = Report::factory()->create([
            'canonical_report_id' => $canonical->id,
        ]);
        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $alreadyDuplicate->uuid,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('canonical_report_uuid');

        $admin = User::factory()->admin()->create();
        $adminDuplicate = Report::factory()->create();
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/reports/{$adminDuplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.duplicate_linkage.is_duplicate', true)
            ->assertJsonPath('data.duplicate_linkage.canonical_case.uuid', $canonical->uuid);
    }

    public function test_closing_a_linked_duplicate_preserves_the_canonical_submitted_evidence(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $canonical = Report::factory()->create([
            'predicted_label' => Report::LABEL_MOSAIC,
            'confidence' => 0.88,
            'field_notes' => 'Canonical submitted observation.',
            'image_path' => 'reports/canonical.png',
        ]);
        $canonicalScores = $canonical->classScores()->pluck('score', 'label')->all();
        $canonicalSymptoms = $canonical->symptoms()->pluck('symptom_key')->all();
        $canonicalEvidence = $canonical->only([
            'image_path',
            'predicted_label',
            'confidence',
            'field_notes',
            'review_status',
            'case_state',
            'lock_version',
        ]);
        $duplicate = Report::factory()->create([
            'predicted_label' => Report::LABEL_MOSAIC,
            'image_path' => 'reports/duplicate.png',
        ]);

        Sanctum::actingAs($reviewer);
        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
            'reason' => 'Reviewer compared the submitted evidence.',
            'expected_version' => 0,
        ])->assertOk();

        $this->patchJson("/api/v1/reports/{$duplicate->uuid}/review", [
            'case_state' => Report::CASE_STATE_CLOSED,
            'notes' => 'Closed as a possible duplicate after review.',
            'expected_version' => 1,
        ])
            ->assertOk()
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_CLOSED)
            ->assertJsonPath('data.duplicate_linkage.canonical_case.uuid', $canonical->uuid)
            ->assertJsonPath('data.version', 2);

        $this->assertSame($canonicalEvidence, $canonical->fresh()->only(array_keys($canonicalEvidence)));
        $this->assertSame($canonicalScores, $canonical->fresh()->classScores()->pluck('score', 'label')->all());
        $this->assertSame($canonicalSymptoms, $canonical->fresh()->symptoms()->pluck('symptom_key')->all());
        $this->assertDatabaseHas('reports', [
            'id' => $duplicate->id,
            'canonical_report_id' => $canonical->id,
            'case_state' => Report::CASE_STATE_CLOSED,
        ]);
        $this->assertDatabaseCount('report_audits', 1);
    }

    public function test_link_rejects_active_consults_completed_evidence_and_closed_cases(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        Sanctum::actingAs($reviewer);

        $cases = [
            [
                'attributes' => [],
                'error' => 'referral',
                'referral' => true,
            ],
            [
                'attributes' => [
                    'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
                ],
                'error' => 'field_validation_state',
            ],
            [
                'attributes' => [
                    'case_state' => Report::CASE_STATE_CLOSED,
                ],
                'error' => 'case_state',
            ],
        ];

        foreach ($cases as $case) {
            $duplicate = Report::factory()->create($case['attributes']);
            $canonical = Report::factory()->create();
            if ($case['referral'] ?? false) {
                ReportReferral::factory()->create([
                    'report_id' => $duplicate->getKey(),
                    'referred_by_id' => $reviewer->getKey(),
                ]);
            }

            $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
                'canonical_report_uuid' => $canonical->uuid,
                'expected_version' => 0,
            ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors($case['error']);

            $this->assertDatabaseHas('reports', [
                'id' => $duplicate->getKey(),
                'canonical_report_id' => null,
                'lock_version' => 0,
            ]);
        }
    }

    public function test_link_rejects_a_stale_version(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $canonical = Report::factory()->create();
        $duplicate = Report::factory()->create();
        $duplicate->update(['lock_version' => 1]);

        Sanctum::actingAs($reviewer);

        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
            'expected_version' => 0,
        ])
            ->assertConflict()
            ->assertJsonPath('code', 'CONFLICT');

        $this->assertDatabaseHas('reports', [
            'id' => $duplicate->getKey(),
            'canonical_report_id' => null,
            'lock_version' => 1,
        ]);
    }

    public function test_link_requires_an_expected_version(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $canonical = Report::factory()->create();
        $duplicate = Report::factory()->create();

        Sanctum::actingAs($reviewer);

        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('expected_version');
    }

    public function test_reviewer_can_unlink_a_duplicate_with_a_current_version(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $canonical = Report::factory()->create();
        $duplicate = Report::factory()->create();

        Sanctum::actingAs($reviewer);
        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
            'expected_version' => 0,
        ])->assertOk();

        $this->deleteJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'expected_version' => 1,
            'reason' => 'The duplicate assessment was reversed after review.',
        ])
            ->assertOk()
            ->assertJsonPath('data.duplicate_linkage.is_duplicate', false)
            ->assertJsonPath('data.duplicate_linkage.canonical_case', null)
            ->assertJsonPath('data.duplicate_linkage.linked_by', null)
            ->assertJsonPath('data.duplicate_linkage.linked_at', null)
            ->assertJsonPath('data.duplicate_linkage.reason', null)
            ->assertJsonPath('data.version', 2);

        $this->assertDatabaseHas('reports', [
            'id' => $duplicate->getKey(),
            'canonical_report_id' => null,
            'lock_version' => 2,
        ]);
        $this->assertDatabaseCount('report_audits', 2);
        $this->assertDatabaseHas('report_audits', [
            'report_id' => $duplicate->getKey(),
            'original_value' => json_encode($canonical->uuid),
            'corrected_value' => null,
            'reason' => 'The duplicate assessment was reversed after review.',
        ]);
    }

    public function test_linked_duplicates_are_excluded_from_operational_views_and_counts(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $expert = User::factory()->expert()->create();
        $submittedAt = CarbonImmutable::parse('2026-09-15T10:00:00Z');
        $canonical = Report::factory()->create([
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'submitted_at' => $submittedAt,
            'observed_at' => $submittedAt,
        ]);
        $duplicate = Report::factory()->create([
            'canonical_report_id' => $canonical->getKey(),
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'submitted_at' => $submittedAt->addMinute(),
            'observed_at' => $submittedAt->addMinute(),
        ]);
        ReportReferral::factory()->create([
            'report_id' => $duplicate->getKey(),
            'referred_by_id' => $reviewer->getKey(),
            'expert_id' => $expert->getKey(),
        ]);

        Sanctum::actingAs($reviewer);
        $this->getJson('/api/v1/reports')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonFragment(['uuid' => $canonical->uuid])
            ->assertJsonMissing(['uuid' => $duplicate->uuid]);
        $this->getJson('/api/v1/reports/map')
            ->assertOk()
            ->assertJsonPath('metadata.total_count', 1)
            ->assertJsonPath('features.0.id', $canonical->uuid);
        $this->getJson('/api/v1/reports/field-validation-queue')
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.uuid', $canonical->uuid);
        $exportResponse = $this->get('/api/v1/reports/export');
        $exportResponse->assertOk();
        $exportRows = array_map(
            'str_getcsv',
            array_filter(preg_split('/\\r\\n|\\r|\\n/', trim($exportResponse->streamedContent())) ?: []),
        );
        $this->assertCount(2, $exportRows);
        $this->assertSame($canonical->reference_code, $exportRows[1][0]);
        $this->getJson('/api/v1/reports/summary?month=2026-09')
            ->assertOk()
            ->assertJsonPath('data.reported_cases', 1);

        Sanctum::actingAs($expert);
        $this->getJson('/api/v1/reports/expert-queue')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);

        Sanctum::actingAs($reviewer);
        $this->getJson('/api/v1/dashboard/summary?month=2026-09')
            ->assertOk()
            ->assertJsonPath('data.counts.total_submitted', 1)
            ->assertJsonPath('data.monthly_summary.reported_cases', 1);
    }

    /**
     * @return array<string, mixed>
     */
    private function uploadPayload(): array
    {
        return [
            'client_uuid' => fake()->uuid(),
            'image' => UploadedFile::fake()->image('new-case.png'),
            'image_source_type' => 'camera',
            'source_width' => 100,
            'source_height' => 100,
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.82,
            'class_scores' => [
                'healthy' => 0.08,
                'mosaic' => 0.10,
                'rust' => 0.82,
            ],
            'symptom_keys' => ['rust'],
            'checklist_consistency' => 'consistent',
            'reported_severity' => 'moderate',
            'quality_warnings' => [],
            'barangay' => 'Mabini',
            'final_latitude' => 14.0667001,
            'final_longitude' => 120.6319001,
            'location_source' => 'gps',
            'gps_accuracy' => 4.5,
            'model_version' => 'caneguard-mobile-v1.0.0',
            'preprocess_ms' => 12.5,
            'inference_ms' => 95.75,
            'total_ms' => 122.25,
            'captured_at' => '2026-08-29T10:00:00.000Z',
        ];
    }
}
