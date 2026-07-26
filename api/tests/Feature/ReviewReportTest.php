<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        ])
            ->assertOk()
            ->assertJsonPath(
                'data.review.status',
                Report::STATUS_FOR_FIELD_VALIDATION,
            )
            ->assertJsonPath('data.review.reviewer.uuid', $reviewer->uuid);

        $report->refresh();

        $this->assertSame($reviewer->getKey(), $report->reviewer_id);
        $this->assertNotNull($report->reviewed_at);
        $this->assertSame(
            'Inspect the field and compare visible symptoms.',
            $report->review_notes,
        );
    }

    public function test_field_reporter_cannot_review_a_report(): void
    {
        $fieldReporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create();

        Sanctum::actingAs($fieldReporter);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_RESOLVED,
            'notes' => 'Unauthorized change.',
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
            'notes' => str_repeat('x', 2001),
        ])
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => 'The given data was invalid.',
                'code' => 'VALIDATION_ERROR',
                'errors' => [
                    'status' => ['The selected status is invalid.'],
                    'notes' => [
                        'The notes field must not be greater than 2000 characters.',
                    ],
                ],
            ]);
    }
}
