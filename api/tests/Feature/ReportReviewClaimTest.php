<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportReviewClaimTest extends TestCase
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

    private function admin(): User
    {
        return User::factory()->inDistrict($this->pilotDistrict())->admin()->create();
    }

    private function report(): Report
    {
        return Report::factory()->inDistrict($this->pilotDistrict())->create([
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
        ]);
    }

    private function claimUrl(Report $report): string
    {
        return "/api/v1/reports/{$report->uuid}/review-claim";
    }

    private function review(Report $report): TestResponse
    {
        return $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'expected_version' => $report->fresh()->lock_version,
        ]);
    }

    public function test_a_reviewer_claims_an_unclaimed_case_without_bumping_the_version(): void
    {
        $report = $this->report();
        $versionBefore = $report->lock_version;
        $me = $this->reviewer();
        Sanctum::actingAs($me);

        $this->postJson($this->claimUrl($report))
            ->assertOk()
            ->assertJsonPath('data.held_by_me', true)
            ->assertJsonPath('data.claimed_by.uuid', $me->uuid);

        $this->assertSame($versionBefore, $report->fresh()->lock_version);
    }

    public function test_a_second_reviewer_is_refused_with_the_holder_named(): void
    {
        $report = $this->report();
        $first = $this->reviewer();
        Sanctum::actingAs($first);
        $this->postJson($this->claimUrl($report))->assertOk();

        Sanctum::actingAs($this->reviewer());
        $this->postJson($this->claimUrl($report))
            ->assertStatus(423)
            ->assertJsonPath('data.claimed_by.uuid', $first->uuid)
            ->assertJsonPath('data.held_by_me', false);
        $this->assertSame($first->getKey(), (int) $report->fresh()->review_claimed_by_id);
    }

    public function test_the_holder_renews_and_keeps_the_original_claim_time(): void
    {
        $report = $this->report();
        Sanctum::actingAs($this->reviewer());
        $first = $this->postJson($this->claimUrl($report))->assertOk()->json('data');

        $this->travel(2)->minutes();
        $renewed = $this->postJson($this->claimUrl($report))->assertOk()->json('data');

        $this->assertSame($first['claimed_at'], $renewed['claimed_at']);
        $this->assertGreaterThan($first['expires_at'], $renewed['expires_at']);
    }

    public function test_an_expired_claim_can_be_taken_by_another_reviewer(): void
    {
        $report = $this->report();
        Sanctum::actingAs($this->reviewer());
        $this->postJson($this->claimUrl($report))->assertOk();

        $this->travel(6)->minutes();
        $second = $this->reviewer();
        Sanctum::actingAs($second);

        $this->postJson($this->claimUrl($report))
            ->assertOk()
            ->assertJsonPath('data.claimed_by.uuid', $second->uuid);
    }

    public function test_only_an_admin_can_take_over_an_active_claim(): void
    {
        $report = $this->report();
        Sanctum::actingAs($this->reviewer());
        $this->postJson($this->claimUrl($report))->assertOk();

        Sanctum::actingAs($this->reviewer());
        $this->postJson($this->claimUrl($report), ['takeover' => true])->assertStatus(423);

        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $this->postJson($this->claimUrl($report), ['takeover' => true])
            ->assertOk()
            ->assertJsonPath('data.claimed_by.uuid', $admin->uuid);
    }

    public function test_review_saves_are_refused_while_another_reviewer_holds_the_case(): void
    {
        $report = $this->report();
        Sanctum::actingAs($this->reviewer());
        $this->postJson($this->claimUrl($report))->assertOk();

        Sanctum::actingAs($this->reviewer());
        $this->review($report)->assertStatus(423);
        $this->assertSame(0, $report->fresh()->lock_version);
    }

    public function test_the_holder_and_unclaimed_cases_can_still_save(): void
    {
        $unclaimed = $this->report();
        $me = $this->reviewer();
        Sanctum::actingAs($me);
        $this->review($unclaimed)->assertOk();

        $claimed = $this->report();
        $this->postJson($this->claimUrl($claimed))->assertOk();
        $this->review($claimed)->assertOk();
    }

    public function test_an_expired_claim_no_longer_blocks_a_save(): void
    {
        $report = $this->report();
        Sanctum::actingAs($this->reviewer());
        $this->postJson($this->claimUrl($report))->assertOk();

        $this->travel(6)->minutes();
        Sanctum::actingAs($this->reviewer());
        $this->review($report)->assertOk();
    }

    public function test_release_frees_only_the_callers_own_claim(): void
    {
        $report = $this->report();
        $holder = $this->reviewer();
        Sanctum::actingAs($holder);
        $this->postJson($this->claimUrl($report))->assertOk();

        Sanctum::actingAs($this->reviewer());
        $this->deleteJson($this->claimUrl($report))->assertOk();
        $this->assertSame($holder->getKey(), (int) $report->fresh()->review_claimed_by_id);

        Sanctum::actingAs($holder);
        $this->deleteJson($this->claimUrl($report))->assertOk();
        $this->assertNull($report->fresh()->review_claimed_by_id);
    }

    public function test_the_case_detail_reports_the_active_claim_and_hides_expired_ones(): void
    {
        $report = $this->report();
        $holder = $this->reviewer();
        Sanctum::actingAs($holder);
        $this->postJson($this->claimUrl($report))->assertOk();

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.review_claim.held_by_me', true);

        $this->travel(6)->minutes();
        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.review_claim', null);
    }
}
