<?php

namespace Tests\Feature;

use App\Actions\Reports\AssessIdentificationGap;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use App\Notifications\ExpertReferralDueSoonNotification;
use App\Notifications\ExpertReferralOverdueNotification;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExpertPhaseTwoTest extends TestCase
{
    use RefreshDatabase;

    public function test_identification_gap_is_derived_without_writing_lifecycle_fields(): void
    {
        $action = app(AssessIdentificationGap::class);
        $unidentified = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'authority_classified_condition' => null,
        ]);
        $provisional = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
        ]);
        $identified = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'authority_classified_condition' => Report::AUTHORITY_CONDITION_SMUT,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'checklist_consistency' => 'consistent',
        ]);
        $closed = Report::factory()->create([
            'case_state' => Report::CASE_STATE_CLOSED,
            'authority_classified_condition' => null,
        ]);

        $this->assertSame('unidentified', $action->handle($unidentified)['state']);
        $this->assertSame('provisional', $action->handle($provisional)['state']);
        $this->assertSame('identified', $action->handle($identified)['state']);
        $this->assertNotSame('unidentified', $action->handle($closed)['state']);
        $this->assertSame(0, $unidentified->fresh()->lock_version);
    }

    public function test_detail_and_list_expose_the_derived_identification_gap(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create([
            'case_state' => Report::CASE_STATE_OPEN,
            'authority_classified_condition' => null,
        ]);
        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.identification_gap.state', 'unidentified')
            ->assertJsonStructure(['data' => ['identification_gap' => ['state', 'reasons']]]);
        $this->getJson('/api/v1/reports')
            ->assertOk()
            ->assertJsonPath('data.0.identification_gap.state', 'unidentified');
    }

    public function test_expert_consult_packet_and_finding_capture_are_scoped(): void
    {
        $expert = User::factory()->expert()->create();
        $other = User::factory()->expert()->create();
        $assigned = ReportReferral::factory()->assignedToExpert($expert)->create();
        $assigned->report->symptoms()->create(['symptom_key' => 'leaf_spots']);
        $assigned->report->refresh();
        Sanctum::actingAs($expert);

        $this->getJson("/api/v1/reports/{$assigned->report->uuid}/consult")
            ->assertOk()
            ->assertJsonPath('data.reference_code', $assigned->report->reference_code)
            ->assertJsonPath('data.consult.question', $assigned->note)
            ->assertJsonPath('data.ai_possible_condition.decision_support_label', 'Decision-support only. This is not a diagnosis.')
            ->assertJsonPath('data.office_context.case_state', Report::CASE_STATE_OPEN);

        $this->postJson("/api/v1/reports/{$assigned->report->uuid}/referral/finding", [
            'condition_opinion' => Report::AUTHORITY_CONDITION_SMUT,
            'symptom_verdicts' => [
                'leaf_spots' => ['verdict' => 'present', 'note' => 'Visible on the submitted photo.'],
                'unknown_key' => ['verdict' => 'present'],
            ],
            'basis' => 'The symptom pattern is consistent.',
            'confidence' => 'high',
            'recommendation' => 'Monitor the affected rows.',
            'consult_status' => ReportReferral::STATUS_COMPLETED,
            'response_date' => '2026-09-24',
            'expected_version' => 0,
        ])->assertOk();

        $this->assertDatabaseHas('report_referral_symptom_findings', [
            'report_referral_id' => $assigned->getKey(),
            'symptom_key' => 'leaf_spots',
            'verdict' => 'present',
        ]);
        $this->assertDatabaseMissing('report_referral_symptom_findings', [
            'report_referral_id' => $assigned->getKey(),
            'symptom_key' => 'unknown_key',
        ]);
        $this->assertNull($assigned->report->fresh()->authority_classified_condition);

        $otherReferral = ReportReferral::factory()->assignedToExpert($other)->create();
        $this->getJson("/api/v1/reports/{$otherReferral->report->uuid}/consult")->assertForbidden();
    }

    public function test_due_soon_and_overdue_reminders_are_idempotent_and_queue_sorts_by_due_date(): void
    {
        CarbonImmutable::setTestNow('2026-09-24 09:00:00');
        try {
            $expert = User::factory()->expert()->create();
            $reviewer = User::factory()->reviewer()->create();
            $soon = ReportReferral::factory()->assignedToExpert($expert)->create([
                'referral_date' => '2026-09-17',
                'due_date' => '2026-09-25',
            ]);
            $later = ReportReferral::factory()->assignedToExpert($expert)->create([
                'referral_date' => '2026-09-17',
                'due_date' => '2026-09-30',
            ]);
            $overdue = ReportReferral::factory()->assignedToExpert($expert)->create([
                'referral_date' => '2026-09-10',
                'due_date' => '2026-09-23',
            ]);

            Sanctum::actingAs($expert);
            $this->getJson('/api/v1/reports/expert-queue?sort=due_soonest')
                ->assertOk()
                ->assertJsonPath('data.0.uuid', $overdue->report->uuid)
                ->assertJsonPath('data.0.expert_consult.age_label', 'Overdue');

            $this->artisan('experts:referral-reminders')->assertSuccessful();
            $this->artisan('experts:referral-reminders')->assertSuccessful();

            $this->assertSame(1, $expert->notifications()->where('type', ExpertReferralDueSoonNotification::class)->count());
            $this->assertSame(1, $expert->notifications()->where('type', ExpertReferralOverdueNotification::class)->count());
            $this->assertSame(1, $reviewer->notifications()->where('type', ExpertReferralOverdueNotification::class)->count());
            $this->assertNotNull($later->fresh()->due_date);
            $this->assertNotNull($overdue->fresh()->due_date);
        } finally {
            CarbonImmutable::setTestNow();
        }
    }
}
