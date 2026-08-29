<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        ])
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());
        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->reviewer()->create());
        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $duplicate->uuid,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('canonical_report_uuid');

        $alreadyDuplicate = Report::factory()->create([
            'canonical_report_id' => $canonical->id,
        ]);
        $this->postJson("/api/v1/reports/{$duplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $alreadyDuplicate->uuid,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('canonical_report_uuid');

        $admin = User::factory()->admin()->create();
        $adminDuplicate = Report::factory()->create();
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/reports/{$adminDuplicate->uuid}/duplicate-link", [
            'canonical_report_uuid' => $canonical->uuid,
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

    /**
     * @return array<string, mixed>
     */
    private function uploadPayload(): array
    {
        return [
            'client_uuid' => fake()->uuid(),
            'image' => \Illuminate\Http\UploadedFile::fake()->image('new-case.png'),
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
