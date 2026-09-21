<?php

namespace Tests\Feature;

use App\Events\CaseAttentionChanged;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use App\Notifications\ExpertReferralAssignedNotification;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExpertAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_expert_can_login_to_the_web_workspace(): void
    {
        $expert = User::factory()->expert()->create([
            'password' => 'correct-password',
        ]);

        $this->postJson('/login', [
            'email' => $expert->email,
            'password' => 'correct-password',
        ])->assertNoContent();

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.role', User::ROLE_EXPERT);
    }

    public function test_office_can_list_only_expert_accounts_in_the_directory(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $admin = User::factory()->admin()->create();
        $expert = User::factory()->expert()->create();
        $anotherExpert = User::factory()->expert()->create();
        $fieldReporter = User::factory()->fieldReporter()->create();

        Sanctum::actingAs($reviewer);
        $this->getJson('/api/v1/experts')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment([
                'uuid' => $expert->uuid,
                'name' => $expert->name,
                'email' => $expert->email,
            ])
            ->assertJsonMissing(['uuid' => $fieldReporter->uuid]);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/experts')->assertOk();

        Sanctum::actingAs($expert);
        $this->getJson('/api/v1/experts')->assertForbidden();

        Sanctum::actingAs($fieldReporter);
        $this->getJson('/api/v1/experts')->assertForbidden();

        $this->assertNotSame($expert->uuid, $anotherExpert->uuid);
    }

    public function test_expert_queue_and_report_detail_are_scoped_to_assigned_consults(): void
    {
        $expert = User::factory()->expert()->create();
        $otherExpert = User::factory()->expert()->create();
        $assigned = ReportReferral::factory()->assignedToExpert($expert)->create();
        $otherAssigned = ReportReferral::factory()->assignedToExpert($otherExpert)->create();
        $unassigned = Report::factory()->create();

        Sanctum::actingAs($expert);

        $this->getJson('/api/v1/reports/expert-queue')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $assigned->report->uuid)
            ->assertJsonMissing(['uuid' => $otherAssigned->report->uuid])
            ->assertJsonMissing(['uuid' => $unassigned->uuid]);

        $this->getJson("/api/v1/reports/{$assigned->report->uuid}")
            ->assertOk();
        $this->getJson("/api/v1/reports/{$otherAssigned->report->uuid}")
            ->assertForbidden();
        $this->getJson("/api/v1/reports/{$unassigned->uuid}")
            ->assertForbidden();
    }

    public function test_expert_access_ends_after_the_configured_consult_window(): void
    {
        Storage::fake('local');
        CarbonImmutable::setTestNow('2026-09-20 09:00:00');

        try {
            $expert = User::factory()->expert()->create();
            $reviewer = User::factory()->reviewer()->create();
            $assigned = ReportReferral::factory()->assignedToExpert($expert)->create();
            $report = $assigned->report;
            Storage::disk('local')->put($report->image_path, 'primary evidence');
            Sanctum::actingAs($expert);

            foreach ([
                "/api/v1/reports/{$report->uuid}",
                "/api/v1/reports/{$report->uuid}/image",
                "/api/v1/reports/{$report->uuid}/referral/summary",
            ] as $path) {
                $this->getJson($path)->assertOk();
            }

            $assigned->update([
                'consult_status' => ReportReferral::STATUS_COMPLETED,
                'finding_summary' => 'The expert proposal.',
                'finding_recorded_by_id' => $expert->getKey(),
                'finding_recorded_at' => now()->utc(),
                'response_date' => now()->toDateString(),
            ]);

            $assigned->update(['consult_status' => ReportReferral::STATUS_CANCELLED]);
            CarbonImmutable::setTestNow('2026-09-21 09:00:00');
            Sanctum::actingAs($expert);
            $this->getJson("/api/v1/reports/{$report->uuid}")->assertForbidden();

            $assigned->update(['consult_status' => ReportReferral::STATUS_COMPLETED]);
            CarbonImmutable::setTestNow('2026-10-01 09:00:00');
            Sanctum::actingAs($expert);
            foreach ([
                "/api/v1/reports/{$report->uuid}",
                "/api/v1/reports/{$report->uuid}/image",
                "/api/v1/reports/{$report->uuid}/referral/summary",
            ] as $path) {
                $this->getJson($path)->assertOk();
            }

            CarbonImmutable::setTestNow('2026-10-05 09:00:00');
            foreach ([
                "/api/v1/reports/{$report->uuid}",
                "/api/v1/reports/{$report->uuid}/image",
                "/api/v1/reports/{$report->uuid}/referral/summary",
            ] as $path) {
                $this->getJson($path)->assertForbidden();
            }

            Sanctum::actingAs($reviewer);
            $this->getJson("/api/v1/reports/{$report->uuid}")->assertOk();
            $this->getJson("/api/v1/reports/{$report->uuid}/referral/summary")->assertOk();

            $assigned->update(['consult_status' => ReportReferral::STATUS_CANCELLED]);
            Sanctum::actingAs($expert);
            $this->getJson("/api/v1/reports/{$report->uuid}")->assertForbidden();
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_expert_cannot_use_office_report_routes_or_review_a_case(): void
    {
        $expert = User::factory()->expert()->create();
        $report = ReportReferral::factory()->assignedToExpert($expert)->create()->report;
        Sanctum::actingAs($expert);

        foreach ([
            '/api/v1/reports',
            '/api/v1/dashboard/summary',
            '/api/v1/reports/map',
            '/api/v1/reports/field-validation-queue',
            '/api/v1/field-reporters',
        ] as $path) {
            $this->getJson($path)->assertForbidden();
        }

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'status' => Report::STATUS_RESOLVED,
            'expected_version' => 0,
        ])->assertForbidden();
    }

    public function test_expert_can_record_only_an_assigned_active_referral_finding(): void
    {
        $expert = User::factory()->expert()->create();
        $otherExpert = User::factory()->expert()->create();
        $assigned = ReportReferral::factory()->assignedToExpert($expert)->create();
        $otherAssigned = ReportReferral::factory()->assignedToExpert($otherExpert)->create();
        Sanctum::actingAs($expert);

        $this->postJson("/api/v1/reports/{$assigned->report->uuid}/referral/finding", [
            'response_date' => '2026-09-19',
            'condition_opinion' => Report::AUTHORITY_CONDITION_SMUT,
            'basis' => 'The assigned expert reviewed the evidence.',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.referral.response_recorded_by.uuid', $expert->uuid)
            ->assertJsonPath('data.referral.condition_opinion', Report::AUTHORITY_CONDITION_SMUT)
            ->assertJsonPath('data.referral.finding_source', ReportReferral::FINDING_SOURCE_IN_SYSTEM);

        $this->postJson("/api/v1/reports/{$otherAssigned->report->uuid}/referral/finding", [
            'response_date' => '2026-09-19',
            'condition_opinion' => Report::AUTHORITY_CONDITION_SMUT,
            'expected_version' => 0,
        ])->assertForbidden();

        $this->postJson("/api/v1/reports/{$assigned->report->uuid}/referral/response", [
            'response_date' => '2026-09-19',
            'response_note' => 'The expert cannot use the office transcription endpoint.',
            'expected_version' => 1,
        ])->assertForbidden();
    }

    public function test_expert_cannot_subscribe_to_the_office_case_attention_channel(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(random_bytes(32)),
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => 'test-app',
        ]);
        require base_path('routes/channels.php');
        $expert = User::factory()->expert()->create();

        $this->actingAs($expert, 'web')
            ->postJson('/broadcasting/auth', [
                'socket_id' => '123.456',
                'channel_name' => "private-users.{$expert->uuid}",
            ])
            ->assertForbidden();
    }

    public function test_expert_assignment_creates_a_scoped_notification_without_a_case_attention_broadcast(): void
    {
        Event::fake([CaseAttentionChanged::class]);
        $reviewer = User::factory()->reviewer()->create();
        $expert = User::factory()->expert()->create();
        $report = Report::factory()->create();
        Sanctum::actingAs($reviewer);

        $this->postJson("/api/v1/reports/{$report->uuid}/referral", [
            'destination' => 'In-system expert desk',
            'reference' => 'EXPERT-1',
            'referral_date' => '2026-09-19',
            'expert_uuid' => $expert->uuid,
            'expected_version' => 0,
        ])->assertCreated()
            ->assertJsonPath('data.referral.expert.uuid', $expert->uuid);

        $notification = $expert->notifications()->sole();
        $this->assertSame(ExpertReferralAssignedNotification::class, $notification->type);
        $this->assertSame(
            ExpertReferralAssignedNotification::EVENT_TYPE,
            $notification->data['event_type'],
        );
        $this->assertSame($report->uuid, $notification->data['report_uuid']);
        Event::assertNotDispatched(CaseAttentionChanged::class);
    }
}
