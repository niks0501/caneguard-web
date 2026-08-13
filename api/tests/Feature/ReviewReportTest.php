<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
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
}
