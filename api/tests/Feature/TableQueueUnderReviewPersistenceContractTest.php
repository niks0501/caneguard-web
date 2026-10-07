<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * PROTECTED CONTRACT TESTS - "Under Review" persistence and concurrency.
 *
 * Contract source: .lavish/table-queue-board.html section 4 ("Under Review
 * already has its signal - first_reviewed_at exists on the payload - opening a
 * case can flip Needs Review -> Under Review with no schema change"), TQ4, and
 * the section 7 ruling Q8:
 *   "Dedicated idempotent endpoint - case open stamps first review only when
 *    empty, never bumps the form version, safe to retry."
 *
 * The endpoint path below is the recommended shape of the ratified ruling; the
 * behavior it must provide is what is asserted. The operation is a mutation on
 * purpose, so it is not attached to the safe case-page read.
 *
 * Baseline expectation: fails at revision 0cea13e because the route does not
 * exist (404), and because reading a case never sets first_reviewed_at.
 */
class TableQueueUnderReviewPersistenceContractTest extends TestCase
{
    use RefreshDatabase;

    /** Ratified dedicated idempotent case-open endpoint (Q8). */
    private const OPEN_PATH = '/open';

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
        return Report::factory()->inDistrict($this->pilotDistrict())->create(array_merge([
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
            'first_reviewed_at' => null,
        ], $attributes));
    }

    private function openUrl(Report $report): string
    {
        return "/api/v1/reports/{$report->uuid}".self::OPEN_PATH;
    }

    public function test_case_open_endpoint_stamps_first_reviewed_at(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->report();

        $this->postJson($this->openUrl($report))->assertSuccessful();

        $this->assertNotNull(
            $report->fresh()->first_reviewed_at,
            'Opening a case must persist the first-reviewed signal so the queue can show Under Review.',
        );
    }

    public function test_case_open_endpoint_is_idempotent_and_safe_to_retry(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->report();

        $this->postJson($this->openUrl($report))->assertSuccessful();
        $first = $report->fresh()->first_reviewed_at;
        $this->assertNotNull($first);

        $this->travel(5)->minutes();
        $this->postJson($this->openUrl($report))->assertSuccessful();

        $this->assertTrue(
            $first->equalTo($report->fresh()->first_reviewed_at),
            'The first-reviewed signal must be stamped only when empty.',
        );
    }

    public function test_case_open_endpoint_never_bumps_the_form_version(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->report();
        $versionBefore = $report->lock_version;

        $this->postJson($this->openUrl($report))->assertSuccessful();

        $this->assertSame(
            $versionBefore,
            $report->fresh()->lock_version,
            'The case-open stamp must not bump the form version the reviewer already loaded.',
        );
    }

    public function test_case_open_endpoint_does_not_invalidate_a_loaded_review_version(): void
    {
        Sanctum::actingAs($this->reviewer());
        $report = $this->report();

        // A reviewer loads the case (version 0), the open stamp runs, then the
        // reviewer submits the decision they already had loaded.
        $this->postJson($this->openUrl($report))->assertSuccessful();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'expected_version' => 0,
        ])->assertOk();
    }

    public function test_case_open_endpoint_requires_web_access(): void
    {
        $report = $this->report();

        $this->postJson($this->openUrl($report))->assertUnauthorized();

        Sanctum::actingAs(
            User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create(),
        );
        $this->postJson($this->openUrl($report))->assertForbidden();
    }
}
