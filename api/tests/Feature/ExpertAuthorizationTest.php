<?php

namespace Tests\Feature;

use App\Events\CaseAttentionChanged;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use App\Notifications\ExpertReferralAssignedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
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

    public function test_expert_can_record_only_an_assigned_active_referral_response(): void
    {
        $expert = User::factory()->expert()->create();
        $otherExpert = User::factory()->expert()->create();
        $assigned = ReportReferral::factory()->assignedToExpert($expert)->create();
        $otherAssigned = ReportReferral::factory()->assignedToExpert($otherExpert)->create();
        Sanctum::actingAs($expert);

        $this->postJson("/api/v1/reports/{$assigned->report->uuid}/referral/response", [
            'response_date' => '2026-09-19',
            'response_note' => 'The assigned expert response.',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.referral.response_recorded_by.uuid', $expert->uuid);

        $this->postJson("/api/v1/reports/{$otherAssigned->report->uuid}/referral/response", [
            'response_date' => '2026-09-19',
            'response_note' => 'An unrelated response.',
            'expected_version' => 0,
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
