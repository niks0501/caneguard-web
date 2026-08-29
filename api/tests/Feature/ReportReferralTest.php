<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use App\Notifications\ExpertReferralResponseReceivedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportReferralTest extends TestCase
{
    use RefreshDatabase;

    public function test_reviewer_records_referral_as_an_action_and_keeps_the_case_open(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'referral_state' => Report::REFERRAL_STATE_NOT_REFERRED,
        ]);
        Sanctum::actingAs($reviewer);

        $this->postJson("/api/v1/reports/{$report->uuid}/referral", [
            'destination' => 'Regional crop protection office',
            'reference' => 'SRA-2026-0042',
            'referral_date' => '2026-09-04',
            'note' => 'Please review the mismatch between the image and reporter observation.',
            'expected_version' => 0,
        ])
            ->assertCreated()
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_OPEN)
            ->assertJsonPath(
                'data.lifecycle.verification_outcome',
                Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            )
            ->assertJsonPath(
                'data.lifecycle.referral_state',
                Report::REFERRAL_STATE_REFERRED,
            )
            ->assertJsonPath(
                'data.review.action_taken',
                Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            )
            ->assertJsonPath('data.referral.destination', 'Regional crop protection office')
            ->assertJsonPath('data.referral.reference', 'SRA-2026-0042')
            ->assertJsonPath('data.referral.referral_date', '2026-09-04')
            ->assertJsonPath('data.referral.note', 'Please review the mismatch between the image and reporter observation.');

        $updated = $report->fresh();
        $this->assertSame(Report::CASE_STATE_OPEN, $updated->case_state);
        $this->assertSame(
            Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            $updated->verification_outcome,
        );
        $this->assertSame(
            Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            $updated->action_taken,
        );
        $this->assertSame(Report::REFERRAL_STATE_REFERRED, $updated->referral_state);
        $this->assertDatabaseHas('report_referrals', [
            'report_id' => $report->getKey(),
            'referred_by_id' => $reviewer->getKey(),
            'destination' => 'Regional crop protection office',
            'reference' => 'SRA-2026-0042',
            'referral_date' => '2026-09-04',
            'office_case_state' => Report::CASE_STATE_OPEN,
            'office_verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
        ]);
    }

    public function test_legacy_review_endpoint_can_record_the_referral_without_changing_its_meaning(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            'referral_destination' => 'Crop disease specialist',
            'referral_reference' => 'CASE-77',
            'referral_date' => '2026-09-05',
            'referral_note' => 'Review the independent field observations.',
            'notes' => 'The office is awaiting expert input.',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath(
                'data.review.action_taken',
                Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            )
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_OPEN)
            ->assertJsonPath('data.referral.reference', 'CASE-77');

        $this->assertDatabaseHas('report_referrals', [
            'report_id' => $report->getKey(),
            'reference' => 'CASE-77',
            'office_review_notes' => 'The office is awaiting expert input.',
        ]);
    }

    public function test_referral_requires_an_open_case_and_reviewer_or_admin_authority(): void
    {
        $fieldReporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create();
        Sanctum::actingAs($fieldReporter);

        $this->postJson("/api/v1/reports/{$report->uuid}/referral", [
            'destination' => 'Specialist',
            'reference' => 'S-1',
            'referral_date' => '2026-09-04',
            'expected_version' => 0,
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        $reviewer = User::factory()->reviewer()->create();
        $closed = Report::factory()->create([
            'case_state' => Report::CASE_STATE_CLOSED,
            'review_status' => Report::STATUS_RESOLVED,
        ]);
        Sanctum::actingAs($reviewer);

        $this->postJson("/api/v1/reports/{$closed->uuid}/referral", [
            'destination' => 'Specialist',
            'reference' => 'S-2',
            'referral_date' => '2026-09-04',
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('referral');

        $this->assertDatabaseCount('report_referrals', 0);
    }

    public function test_expert_response_updates_authority_finding_and_verification_before_closure(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
        ]);
        Sanctum::actingAs($reviewer);
        $this->recordReferral($report);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'expected_version' => 1,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('action_taken');

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'case_state' => Report::CASE_STATE_CLOSED,
            'expected_version' => 1,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('case_state');
        $this->assertSame(Report::CASE_STATE_OPEN, $report->fresh()->case_state);

        $this->postJson("/api/v1/reports/{$report->uuid}/referral/response", [
            'response_date' => '2026-09-08',
            'response_note' => 'The specialist reviewed the supplied image.',
            'response_finding' => 'The finding is consistent with the authority condition listed below.',
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'expected_version' => 1,
        ])
            ->assertOk()
            ->assertJsonPath(
                'data.lifecycle.referral_state',
                Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED,
            )
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_OPEN)
            ->assertJsonPath('data.lifecycle.verification_outcome', Report::VERIFICATION_OUTCOME_VERIFIED)
            ->assertJsonPath(
                'data.review.authority_classified_condition',
                Report::AUTHORITY_CONDITION_SMUT,
            )
            ->assertJsonPath('data.referral.response_date', '2026-09-08')
            ->assertJsonPath('data.referral.response_finding', 'The finding is consistent with the authority condition listed below.');

        $updated = $report->fresh();
        $this->assertSame(Report::CASE_STATE_OPEN, $updated->case_state);
        $this->assertSame(Report::VERIFICATION_OUTCOME_VERIFIED, $updated->verification_outcome);
        $this->assertSame(Report::REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED, $updated->referral_state);
        $this->assertSame(Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION, $updated->action_taken);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'case_state' => Report::CASE_STATE_CLOSED,
            'expected_version' => 2,
        ])
            ->assertOk()
            ->assertJsonPath('data.lifecycle.case_state', Report::CASE_STATE_CLOSED)
            ->assertJsonPath('data.lifecycle.verification_outcome', Report::VERIFICATION_OUTCOME_VERIFIED)
            ->assertJsonPath('data.review.status', Report::STATUS_VERIFIED_BY_STAFF);
    }

    public function test_expert_response_is_reviewer_or_admin_only_and_requires_an_active_referral(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $fieldReporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create();
        Sanctum::actingAs($reviewer);
        $this->recordReferral($report);

        Sanctum::actingAs($fieldReporter);
        $this->postJson("/api/v1/reports/{$report->uuid}/referral/response", [
            'response_date' => '2026-09-08',
            'response_note' => 'Unauthorized response.',
            'expected_version' => 1,
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        $notReferred = Report::factory()->create();
        Sanctum::actingAs($reviewer);
        $this->postJson("/api/v1/reports/{$notReferred->uuid}/referral/response", [
            'response_date' => '2026-09-08',
            'response_note' => 'There is no handoff to answer.',
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('referral');
    }

    public function test_expert_response_notifies_all_office_users_and_not_field_reporters(): void
    {
        Event::fake();
        $reviewer = User::factory()->reviewer()->create();
        $admin = User::factory()->admin()->create();
        $fieldReporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create();
        Sanctum::actingAs($reviewer);
        $this->recordReferral($report);

        $this->postJson("/api/v1/reports/{$report->uuid}/referral/response", [
            'response_date' => '2026-09-08',
            'response_note' => 'Response received for office review.',
            'expected_version' => 1,
        ])->assertOk();

        foreach ([$reviewer, $admin] as $recipient) {
            $notification = $recipient->notifications()->sole();
            $this->assertSame(
                ExpertReferralResponseReceivedNotification::class,
                $notification->type,
            );
            $this->assertSame(
                ExpertReferralResponseReceivedNotification::EVENT_TYPE,
                $notification->data['event_type'],
            );
            $this->assertSame($report->uuid, $notification->data['report_uuid']);
            $this->assertSame('2026-09-08', $notification->data['response_date']);
        }
        $this->assertCount(0, $fieldReporter->notifications()->get());
        $this->assertDatabaseCount('notifications', 2);
    }

    public function test_referral_summary_contains_evidence_and_the_handoff_snapshot(): void
    {
        Storage::fake('local');
        $reviewer = User::factory()->reviewer()->create(['name' => 'Office Reviewer']);
        $report = Report::factory()->create([
            'farmer_or_farm_owner_name' => 'Juan Dela Cruz',
            'barangay' => 'Mabini',
            'municipality' => 'Bago',
            'province' => 'Negros Occidental',
            'affected_area_hectares' => 12.5,
            'affected_portion_percent' => 42.75,
            'final_latitude' => 10.1234567,
            'final_longitude' => 122.9876543,
            'location_source' => 'gps',
            'mismatch_reported' => true,
            'reporter_suspected_condition' => 'smut',
            'reporter_observation_text' => 'Dark whip-like growths are visible.',
            'field_notes' => 'Observed on the eastern edge.',
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.82,
        ]);
        Storage::disk('local')->put($report->image_path, 'primary evidence');
        Sanctum::actingAs($reviewer);

        $this->postJson("/api/v1/reports/{$report->uuid}/referral", [
            'destination' => 'Regional crop protection office',
            'reference' => 'SRA-2026-0099',
            'referral_date' => '2026-09-04',
            'note' => 'Please compare the image with the reported observation.',
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY,
            'office_notes' => 'Office context captured before external review.',
            'expected_version' => 0,
        ])->assertCreated();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'expected_version' => 1,
        ])->assertOk();

        $this->getJson("/api/v1/reports/{$report->uuid}/referral/summary")
            ->assertOk()
            ->assertJsonPath('data.case.reference_code', $report->reference_code)
            ->assertJsonPath('data.location.barangay', 'Mabini')
            ->assertJsonPath('data.location.municipality', 'Bago')
            ->assertJsonPath('data.location.province', 'Negros Occidental')
            ->assertJsonPath('data.affected.area_hectares', 12.5)
            ->assertJsonPath('data.affected.portion_percent', 42.75)
            ->assertJsonPath('data.primary_evidence.available', true)
            ->assertJsonPath('data.primary_evidence.url', route('api.v1.reports.image', ['report' => $report->uuid]))
            ->assertJsonPath('data.reporter_observations.observation_text', 'Dark whip-like growths are visible.')
            ->assertJsonPath('data.possible_ai_result.role', 'decision_support_only')
            ->assertJsonPath('data.possible_ai_result.label', Report::LABEL_RUST)
            ->assertJsonPath('data.office_context.authority_classified_condition', Report::AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY)
            ->assertJsonPath('data.office_context.verification_outcome', Report::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY)
            ->assertJsonPath('data.office_context.notes', 'Office context captured before external review.')
            ->assertJsonPath('data.referral.reference', 'SRA-2026-0099');

        $this->get("/api/v1/reports/{$report->uuid}/referral/summary")
            ->assertOk()
            ->assertHeader('Content-Type', 'text/html; charset=UTF-8')
            ->assertSee('Possible AI result - decision support only')
            ->assertSee('This is not a diagnosis or an authority finding.')
            ->assertSee('Juan Dela Cruz')
            ->assertSee('Office context captured before external review.')
            ->assertSee('SRA-2026-0099')
            ->assertSee(route('api.v1.reports.image', ['report' => $report->uuid]), false);
    }

    public function test_referral_summary_requires_a_referral_and_report_view_authority(): void
    {
        $report = Report::factory()->create();
        $fieldReporter = User::factory()->fieldReporter()->create();
        Sanctum::actingAs($fieldReporter);

        $this->getJson("/api/v1/reports/{$report->uuid}/referral/summary")
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->reviewer()->create());
        $this->getJson("/api/v1/reports/{$report->uuid}/referral/summary")
            ->assertNotFound()
            ->assertJsonPath('code', 'NOT_FOUND');
    }

    private function recordReferral(Report $report): void
    {
        $this->postJson("/api/v1/reports/{$report->uuid}/referral", [
            'destination' => 'Specialist office',
            'reference' => 'REF-1',
            'referral_date' => '2026-09-04',
            'expected_version' => 0,
        ])->assertCreated();
    }
}
