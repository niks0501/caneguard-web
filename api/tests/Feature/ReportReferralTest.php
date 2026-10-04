<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportReferralTest extends TestCase
{
    use RefreshDatabase;

    public function test_retired_write_paths_do_not_change_rows_or_create_notifications(): void
    {
        $report = Report::factory()->create(['referral_state' => 'referred', 'action_taken' => 'referred_for_expert_validation']);
        $referral = ReportReferral::factory()->for($report)->create();
        $before = $referral->fresh()->getAttributes();
        Sanctum::actingAs(User::factory()->reviewer()->create());
        foreach (['', '/response', '/finding', '/confirm', '/invite', '/invite/revoke'] as $operation) {
            $this->postJson("/api/v1/reports/{$report->uuid}/referral{$operation}", ['expected_version' => 0])
                ->assertStatus(410)->assertJsonPath('message', 'The in-system expert workflow was retired.');
        }
        $this->deleteJson("/api/v1/reports/{$report->uuid}/referral/invite")->assertStatus(410);
        $this->assertSame($before, $referral->fresh()->getAttributes());
        $this->assertDatabaseCount('report_referrals', 1);
        $this->assertDatabaseCount('notifications', 0);
        $this->assertSame('referred', $report->fresh()->referral_state);
    }

    public function test_review_rejects_retired_fields_but_can_close_a_historical_case(): void
    {
        $report = Report::factory()->create(['referral_state' => 'referred', 'action_taken' => 'referred_for_expert_validation']);
        ReportReferral::factory()->for($report)->create(['consult_status' => 'pending']);
        Sanctum::actingAs(User::factory()->reviewer()->create());
        foreach ([['action_taken' => 'referred_for_expert_validation'], ['referral_state' => 'not_referred'], ['referral_destination' => 'Desk']] as $input) {
            $this->patchJson("/api/v1/reports/{$report->uuid}/review", ['expected_version' => 0, ...$input])->assertUnprocessable();
        }
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'expected_version' => 0, 'case_state' => 'closed', 'verification_outcome' => 'verified',
            'authority_classified_condition' => 'smut', 'notes' => 'Staff reviewed the evidence.',
        ])->assertOk();
        $this->assertSame('referred', $report->fresh()->referral_state);
        $this->assertSame('referred_for_expert_validation', $report->fresh()->action_taken);
        $this->assertSame('closed', $report->fresh()->case_state);
    }

    public function test_retirement_migration_preserves_rows_findings_lifecycle_and_completed_status(): void
    {
        $expert = User::factory()->create(['role' => 'expert']);
        $report = Report::factory()->create(['referral_state' => 'referred', 'action_taken' => 'referred_for_expert_validation']);
        $pending = ReportReferral::factory()->for($report)->create(['expert_id' => $expert->id, 'consult_status' => 'pending', 'invite_token_hash' => hash('sha256', 'retired-token'), 'invite_revoked_at' => null]);
        $progress = ReportReferral::factory()->for($report)->create(['consult_status' => 'in_progress']);
        $completed = ReportReferral::factory()->for($report)->create(['consult_status' => 'completed', 'finding_summary' => 'Historical finding']);
        DB::table('report_referral_symptom_findings')->insert([
            'report_referral_id' => $completed->id, 'symptom_key' => 'test-symptom', 'verdict' => 'present',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $migration = require database_path('migrations/2026_10_04_000000_retire_in_system_expert_workflow.php');
        $migration->up();
        $migration->up();
        $migration->down();
        $this->assertDatabaseCount('report_referrals', 3);
        $this->assertDatabaseCount('report_referral_symptom_findings', 1);
        $this->assertDatabaseCount('report_audits', 2);
        $this->assertSame('cancelled', $pending->fresh()->consult_status);
        $this->assertSame('cancelled', $progress->fresh()->consult_status);
        $this->assertNotNull($pending->fresh()->invite_revoked_at);
        $this->assertSame('completed', $completed->fresh()->consult_status);
        $this->assertSame('Historical finding', $completed->fresh()->finding_summary);
        $this->assertSame('disabled', $expert->fresh()->role);
        $this->assertSame('referred', $report->fresh()->referral_state);
        $this->assertSame('referred_for_expert_validation', $report->fresh()->action_taken);
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $this->getJson("/api/v1/reports/{$report->uuid}")->assertOk()->assertJsonFragment([
            'test-symptom' => ['verdict' => 'present', 'note' => null],
        ]);
        $this->get("/api/v1/reports/{$report->uuid}/referral/summary?download=1")
            ->assertOk()->assertSee('Historical finding')->assertSee('test-symptom');
    }

    public function test_retirement_does_not_skip_consults_when_the_active_query_shrinks_between_batches(): void
    {
        $report = Report::factory()->create();
        $author = User::factory()->reviewer()->create();
        DB::table('report_referrals')->insert(array_fill(0, 1005, [
            'report_id' => $report->getKey(), 'referred_by_id' => $author->getKey(),
            'destination' => 'Historical destination', 'referral_date' => '2026-10-01',
            'consult_status' => 'pending', 'office_case_state' => 'open',
            'office_verification_outcome' => 'not_determined', 'office_field_validation_state' => 'unassigned',
        ]));
        $migration = require database_path('migrations/2026_10_04_000000_retire_in_system_expert_workflow.php');
        $migration->up();
        $this->assertSame(1005, DB::table('report_referrals')->where('consult_status', 'cancelled')->count());
        $this->assertDatabaseCount('report_audits', 1005);
        $migration->up();
        $this->assertDatabaseCount('report_audits', 1005);
        $this->assertDatabaseCount('report_referrals', 1005);
    }

    public function test_old_expert_accounts_and_existing_tokens_have_no_office_access(): void
    {
        $report = Report::factory()->create();
        foreach (['expert', 'disabled'] as $role) {
            Sanctum::actingAs(User::factory()->create(['role' => $role]));
            $this->getJson('/api/v1/me')->assertForbidden();
            $this->getJson('/api/v1/reports')->assertForbidden();
            $this->getJson("/api/v1/reports/{$report->uuid}")->assertForbidden();
            $this->get("/api/v1/reports/{$report->uuid}/referral/summary?download=1")->assertForbidden();
            $this->postJson("/api/v1/reports/{$report->uuid}/handoff-notes", [])->assertForbidden();
        }
        $this->assertNotContains('expert', User::roles());
        $this->assertNotContains('expert', User::webRoles());
    }

    public function test_existing_tokens_and_browser_credentials_cannot_bypass_disabled_expert_access(): void
    {
        $password = Str::random(40);
        $expert = User::factory()->create(['role' => 'expert', 'password' => $password]);
        $token = $expert->createToken('retired-expert-regression')->plainTextToken;
        $migration = require database_path('migrations/2026_10_04_000000_retire_in_system_expert_workflow.php');
        $migration->up();
        Auth::forgetGuards();
        $this->withToken($token)->getJson('/api/v1/reports')->assertForbidden();
        $this->withToken($token)->getJson('/api/v1/dashboard/summary')->assertForbidden();
        $this->withToken($token)->getJson('/api/v1/notifications')->assertForbidden();
        Auth::forgetGuards();
        Auth::shouldUse('web');
        $this->withHeader('Authorization', '')->postJson('/login', [
            'email' => $expert->email, 'password' => $password,
        ])->assertForbidden();
        $this->assertGuest('web');
    }

    public function test_removed_expert_reads_invites_and_command_are_absent(): void
    {
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $report = Report::factory()->create();
        foreach (['/api/v1/experts', '/api/v1/reports/expert-queue', "/api/v1/reports/{$report->uuid}/consult", '/api/v1/consult-invites/old-token', '/api/v1/consult-invites/old-token/image'] as $url) {
            $this->getJson($url)->assertNotFound();
        }
        $this->assertArrayNotHasKey('experts:referral-reminders', Artisan::all());
    }

    public function test_plain_handoff_note_does_not_write_an_expert_lifecycle_or_notification(): void
    {
        $report = Report::factory()->create(['referral_state' => 'expert_response_received', 'action_taken' => 'referred_for_expert_validation']);
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $this->postJson("/api/v1/reports/{$report->uuid}/handoff-notes", [
            'destination' => ' Offline agronomy desk ', 'reference' => ' EXT-42 ', 'sent_date' => '2026-10-04',
            'note' => 'Printed case summary sent.', 'advice_received_note' => 'Offline advice retained as a note.', 'expected_version' => 0,
        ])->assertOk()->assertJsonPath('data.handoff_notes.0.destination', 'Offline agronomy desk');
        $this->assertDatabaseCount('report_referrals', 0);
        $this->assertDatabaseCount('notifications', 0);
        $this->assertSame('expert_response_received', $report->fresh()->referral_state);
        $this->assertSame('referred_for_expert_validation', $report->fresh()->action_taken);
        $this->assertSame(1, $report->fresh()->lock_version);
        $migration = require database_path('migrations/2026_10_04_000001_create_report_handoff_notes_table.php');
        $migration->down();
        $migration->up();
        $this->assertDatabaseCount('report_handoff_notes', 1);
        $this->get("/api/v1/reports/{$report->uuid}/referral/summary?download=1")
            ->assertOk()->assertSee('Offline agronomy desk')->assertSee('EXT-42')->assertSee('Offline advice retained as a note.');
    }

    public function test_handoff_notes_require_authority_valid_fields_and_current_version(): void
    {
        $report = Report::factory()->create();
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $url = "/api/v1/reports/{$report->uuid}/handoff-notes";
        $this->postJson($url, ['expected_version' => 0])->assertUnprocessable();
        $input = ['destination' => 'Desk', 'sent_date' => '2026-10-04', 'expected_version' => 1];
        $this->postJson($url, $input)->assertConflict();
        $this->postJson($url, [...$input, 'expected_version' => 0, 'due_date' => '2026-10-11'])->assertUnprocessable();
        Sanctum::actingAs(User::factory()->fieldReporter()->create());
        $this->postJson($url, [...$input, 'expected_version' => 0])->assertForbidden();
        $this->assertDatabaseCount('report_handoff_notes', 0);
    }

    public function test_historical_records_and_recommendations_remain_readable_and_printable(): void
    {
        Storage::fake('local');
        $report = Report::factory()->create(['referral_state' => 'expert_response_received', 'authority_classified_condition' => 'smut', 'review_notes' => 'Current office recommendation']);
        ReportReferral::factory()->for($report)->create(['consult_status' => 'completed', 'destination' => 'Historical desk', 'finding_summary' => 'Historical advice']);
        ReportReferral::factory()->for($report)->create(['consult_status' => 'cancelled', 'destination' => 'Second historical desk']);
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $this->getJson("/api/v1/reports/{$report->uuid}")->assertOk()->assertJsonCount(2, 'data.consults');
        $this->getJson('/api/v1/reports')->assertOk()->assertJsonMissingPath('data.0.expert_consult')->assertJsonMissingPath('data.0.consults');
        $this->get("/api/v1/reports/{$report->uuid}/referral/summary")->assertOk()
            ->assertSee('Expert referral (historical)')->assertSee('Possible AI result')->assertSee('Second historical desk')->assertSee('Historical desk')->assertSee('Historical advice');
        $this->getJson('/api/v1/reports/summary')->assertOk()->assertJsonMissingPath('data.expert_verification');
    }

    public function test_case_summary_works_without_any_referral(): void
    {
        $report = Report::factory()->create();
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $this->getJson("/api/v1/reports/{$report->uuid}/referral/summary")->assertOk()->assertJsonPath('data.referral', null);
        $this->get("/api/v1/reports/{$report->uuid}/referral/summary?download=1")->assertOk()->assertSee('CaneGuard case summary');
    }
}
