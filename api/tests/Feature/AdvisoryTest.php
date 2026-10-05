<?php

namespace Tests\Feature;

use App\Models\Advisory;
use App\Models\Report;
use App\Models\User;
use App\Notifications\AdvisoryAvailableNotification;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdvisoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    public function test_advisory_library_requires_provenance_for_validation_and_retirement_is_terminal(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        Sanctum::actingAs($reviewer);

        $draft = $this->postJson('/api/v1/advisories', [
            'code' => 'ADV-SMUT-001',
            'title' => 'Smut sanitation steps',
            'content' => 'Remove affected stalks and disinfect tools.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', Advisory::STATUS_DRAFT)
            ->json('data');

        $this->postJson("/api/v1/advisories/{$draft['uuid']}/validate", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $validated = $this->postJson("/api/v1/advisories/{$draft['uuid']}/validate", [
            'validation_provenance' => 'Validated against the 2026 office guidance register.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', Advisory::STATUS_VALIDATED)
            ->assertJsonPath('data.validation_provenance', 'Validated against the 2026 office guidance register.')
            ->json('data');

        $this->patchJson("/api/v1/advisories/{$validated['uuid']}", [
            'content' => 'Attempted replacement after validation.',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->postJson("/api/v1/advisories/{$validated['uuid']}/retire", [])
            ->assertOk()
            ->assertJsonPath('data.status', Advisory::STATUS_RETIRED);

        $this->postJson("/api/v1/advisories/{$validated['uuid']}/validate", [
            'validation_provenance' => 'A second validation must not reopen retirement.',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');
    }

    public function test_default_seeded_advisory_is_listed_and_can_be_attached_to_a_case(): void
    {
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.demo_users.expert_password' => 'expert-test-password',
        ]);
        $this->seed(DatabaseSeeder::class);
        $this->approveSeededPilotFixtures();

        $reviewer = User::query()->where('email', 'mao@caneguard.test')->firstOrFail();
        $reporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create(['reporter_id' => $reporter]);
        Sanctum::actingAs($reviewer);

        $advisory = $this->getJson('/api/v1/advisories')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->json('data.0');
        $this->assertSame(Advisory::STATUS_VALIDATED, $advisory['status']);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'advisory_uuid' => $advisory['uuid'],
            'notes' => 'Office reference guidance selected for the case.',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.advisory.uuid', $advisory['uuid'])
            ->assertJsonPath('data.advisory.code', $advisory['code'])
            ->assertJsonPath('data.advisory.delivery_state', Report::ADVISORY_DELIVERY_DELIVERED);

        $this->assertDatabaseHas('reports', [
            'id' => $report->getKey(),
            'advisory_id' => Advisory::query()->where('uuid', $advisory['uuid'])->value('id'),
            'advisory_delivery_state' => Report::ADVISORY_DELIVERY_DELIVERED,
        ]);
    }

    public function test_only_validated_advisory_can_be_selected_and_delivery_reaches_both_mobile_channels(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $reporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create(['reporter_id' => $reporter]);
        $draft = Advisory::factory()->create(['code' => 'ADV-DRAFT-001']);
        $validated = Advisory::factory()->validated(
            $reviewer,
            'Validated from the current office field guide.',
        )->create([
            'code' => 'ADV-SMUT-002',
            'title' => 'Sanitize tools',
            'content' => 'Remove affected stalks and disinfect tools before the next row.',
        ]);

        Sanctum::actingAs($reviewer);
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'advisory_uuid' => $draft->uuid,
            'expected_version' => 0,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('advisory_uuid');

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'advisory_uuid' => $validated->uuid,
            'notes' => 'Office guidance selected for the field reporter.',
            'expected_version' => 0,
        ])
            ->assertOk()
            ->assertJsonPath('data.advisory.code', 'ADV-SMUT-002')
            ->assertJsonPath('data.advisory.delivery_state', Report::ADVISORY_DELIVERY_DELIVERED);

        $report->refresh();
        $this->assertSame(Report::ADVISORY_DELIVERY_DELIVERED, $report->advisory_delivery_state);
        $notification = $reporter->notifications()->sole();
        $this->assertSame(AdvisoryAvailableNotification::class, $notification->type);
        $this->assertSame('advisory_available', $notification->data['event_type']);
        $this->assertSame($validated->content, $notification->data['content']);
        $this->assertSame($validated->content, $notification->data['advisory']['content']);

        $token = $reporter->createToken('advisory-status', ['report:status'])->plainTextToken;
        Auth::forgetGuards();
        $this->withToken($token)
            ->getJson('/api/v3/mobile/reports/statuses?sync_before='.urlencode(now()->addMinute()->toISOString()))
            ->assertOk()
            ->assertJsonPath('data.0.advisory.uuid', $validated->uuid)
            ->assertJsonPath('data.0.advisory.content', $validated->content)
            ->assertJsonPath('data.0.advisory.delivery_state', Report::ADVISORY_DELIVERY_DELIVERED);

        $notificationToken = $reporter->createToken('advisory-notifications', ['notification:read'])->plainTextToken;
        Auth::forgetGuards();
        $this->withToken($notificationToken)
            ->getJson('/api/v1/mobile/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.event_type', AdvisoryAvailableNotification::EVENT_TYPE)
            ->assertJsonPath('data.0.content', $validated->content)
            ->assertJsonPath('data.0.advisory.title', $validated->title);

        $this->withToken($notificationToken)
            ->patchJson("/api/v1/mobile/notifications/{$notification->id}/read")
            ->assertOk();
        $this->assertSame(
            Report::ADVISORY_DELIVERY_ACKNOWLEDGED,
            $report->fresh()->advisory_delivery_state,
        );

        $this->withoutToken();
        Auth::forgetGuards();
        Sanctum::actingAs($reviewer);
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'advisory_uuid' => $validated->uuid,
            'expected_version' => 1,
        ])->assertOk();
        $this->assertCount(1, $reporter->notifications()->get());
    }

    public function test_a_stale_advisory_notification_cannot_acknowledge_a_replacement(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $reporter = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create(['reporter_id' => $reporter]);
        $first = Advisory::factory()->validated($reviewer, 'First guidance source.')->create([
            'code' => 'ADV-FIRST-001',
        ]);
        $replacement = Advisory::factory()->validated($reviewer, 'Replacement guidance source.')->create([
            'code' => 'ADV-REPLACEMENT-001',
        ]);

        Sanctum::actingAs($reviewer);
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'advisory_uuid' => $first->uuid,
            'expected_version' => 0,
        ])->assertOk();

        $firstNotification = $reporter->notifications()->sole();

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'advisory_uuid' => $replacement->uuid,
            'expected_version' => 1,
        ])->assertOk();

        $replacementNotification = $reporter->notifications()
            ->whereNotIn('id', [$firstNotification->getKey()])
            ->sole();
        $token = $reporter->createToken('advisory-stale-read', ['notification:read'])->plainTextToken;
        Auth::forgetGuards();

        $this->withToken($token)
            ->patchJson("/api/v1/mobile/notifications/{$firstNotification->id}/read")
            ->assertOk();
        $this->assertSame(
            Report::ADVISORY_DELIVERY_DELIVERED,
            $report->fresh()->advisory_delivery_state,
        );

        $this->withToken($token)
            ->patchJson("/api/v1/mobile/notifications/{$replacementNotification->id}/read")
            ->assertOk();
        $this->assertSame(
            Report::ADVISORY_DELIVERY_ACKNOWLEDGED,
            $report->fresh()->advisory_delivery_state,
        );
    }

    public function test_printable_referral_summary_includes_selected_advisory_content_and_provenance(): void
    {
        $reviewer = User::factory()->reviewer()->create(['name' => 'Office Reviewer']);
        $report = Report::factory()->create();
        $advisory = Advisory::factory()->validated(
            $reviewer,
            'Validated by the 2026 office field guide.',
        )->create([
            'title' => 'Field sanitation',
            'content' => 'Disinfect tools between rows.',
        ]);
        $report->update([
            'advisory_id' => $advisory->getKey(),
            'advisory_selected_by_id' => $reviewer->getKey(),
            'advisory_selected_at' => now()->utc(),
            'advisory_delivery_state' => Report::ADVISORY_DELIVERY_DELIVERED,
            'advisory_delivered_at' => now()->utc(),
        ]);
        $report->referrals()->create([
            'referred_by_id' => $reviewer->getKey(),
            'destination' => 'Regional crop protection office',
            'reference' => 'REF-ADVISORY-001',
            'referral_date' => now()->toDateString(),
            'office_case_state' => Report::CASE_STATE_OPEN,
            'office_verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'office_field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
            'office_action_taken' => Report::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
        ]);

        Sanctum::actingAs($reviewer);
        $this->getJson("/api/v1/reports/{$report->uuid}/referral/summary")
            ->assertOk()
            ->assertJsonPath('data.advisory.title', 'Field sanitation')
            ->assertJsonPath('data.advisory.content', 'Disinfect tools between rows.')
            ->assertJsonPath('data.advisory.validation_provenance', 'Validated by the 2026 office field guide.');

        $this->get("/api/v1/reports/{$report->uuid}/referral/summary")
            ->assertOk()
            ->assertSee('Office advisory')
            ->assertSee('Disinfect tools between rows.')
            ->assertSee('Validated by the 2026 office field guide.');
    }
}
