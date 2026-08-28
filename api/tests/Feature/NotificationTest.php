<?php

namespace Tests\Feature;

use App\Contracts\MobileNotificationContract;
use App\Events\CaseAttentionChanged;
use App\Events\NewCaseSubmitted;
use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use App\Notifications\FieldValidationAssignedNotification;
use App\Notifications\FieldValidationAssignmentChangedNotification;
use App\Notifications\FieldValidationCompletedNotification;
use App\Notifications\FollowUpDueNotification;
use App\Notifications\NewCaseSubmittedNotification;
use App\Notifications\OfficeReviewCompletedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_submission_creates_durable_notifications_for_office_users(): void
    {
        Storage::fake('local');
        Event::fake([NewCaseSubmitted::class]);
        $reporter = User::factory()->fieldReporter()->create();
        $reviewer = User::factory()->reviewer()->create();
        $admin = User::factory()->admin()->create();
        $clientUuid = fake()->uuid();
        $token = $reporter->createToken('notification-upload')->plainTextToken;

        $response = $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid));

        $response->assertCreated();
        $reportUuid = $response->json('data.identity.uuid');
        $referenceCode = $response->json('data.identity.reference_code');

        $this->assertDatabaseCount('notifications', 2);
        foreach ([$reviewer, $admin] as $recipient) {
            $notification = $recipient->notifications()->sole();

            $this->assertSame(
                NewCaseSubmittedNotification::class,
                $notification->type,
            );
            $this->assertNull($notification->read_at);
            $this->assertSame(
                NewCaseSubmittedNotification::EVENT_TYPE,
                $notification->data['event_type'],
            );
            $this->assertSame($reportUuid, $notification->data['report_uuid']);
            $this->assertSame($referenceCode, $notification->data['reference_code']);
        }
        $this->assertDatabaseCount('notifications', 2);
        $this->assertCount(0, $reporter->notifications);

        Event::assertDispatchedTimes(NewCaseSubmitted::class, 2);
        Event::assertDispatched(NewCaseSubmitted::class, function (NewCaseSubmitted $event) use ($reviewer, $reportUuid, $referenceCode): bool {
            return $event->recipientUuid === $reviewer->uuid
                && $event->reportUuid === $reportUuid
                && $event->referenceCode === $referenceCode
                && $event->broadcastOn()[0]->name === "private-users.{$reviewer->uuid}"
                && $event->broadcastAs() === 'case.submitted'
                && $event->broadcastWith() === [
                    'event_type' => 'new_case_submitted',
                    'domains' => ['reports', 'dashboard', 'notifications'],
                ];
        });
    }

    public function test_idempotent_resubmission_does_not_create_duplicate_attention_items(): void
    {
        Storage::fake('local');
        Event::fake([NewCaseSubmitted::class]);
        $reporter = User::factory()->fieldReporter()->create();
        User::factory()->reviewer()->create();
        $token = $reporter->createToken('notification-idempotency')->plainTextToken;
        $clientUuid = fake()->uuid();

        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid))
            ->assertCreated();
        $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/mobile/reports', $this->payload($clientUuid))
            ->assertOk();

        $this->assertDatabaseCount('notifications', 1);
        Event::assertDispatchedTimes(NewCaseSubmitted::class, 1);
    }

    public function test_notification_feed_and_read_actions_are_scoped_to_the_authenticated_user(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $otherReviewer = User::factory()->reviewer()->create();
        $fieldReporter = User::factory()->fieldReporter()->create();
        $first = $this->createNotification($reviewer, 'CG-20260817-A');
        $second = $this->createNotification($reviewer, 'CG-20260817-B');
        $other = $this->createNotification($otherReviewer, 'CG-20260817-C');

        $this->actingAs($reviewer, 'web')
            ->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.unread_count', 2)
            ->assertJsonPath('data.0.is_read', false);

        $this->actingAs($reviewer, 'web')
            ->patchJson("/api/v1/notifications/{$first->id}/read")
            ->assertOk()
            ->assertJsonPath('data.is_read', true)
            ->assertJsonPath('data.id', $first->id);

        $this->actingAs($reviewer, 'web')
            ->getJson('/api/v1/notifications')
            ->assertJsonPath('meta.unread_count', 1)
            ->assertJsonPath('data.0.is_read', false)
            ->assertJsonPath('data.1.is_read', true);

        $this->actingAs($reviewer, 'web')
            ->patchJson("/api/v1/notifications/{$other->id}/read")
            ->assertNotFound();
        $this->assertNull($other->fresh()->read_at);

        $this->actingAs($reviewer, 'web')
            ->postJson('/api/v1/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('meta.marked_count', 1)
            ->assertJsonPath('meta.unread_count', 0);
        $this->assertNotNull($second->fresh()->read_at);

        Sanctum::actingAs($fieldReporter);
        $this->getJson('/api/v1/notifications')->assertForbidden();
    }

    public function test_assignment_creation_and_material_changes_notify_only_the_current_assignee(): void
    {
        Event::fake([CaseAttentionChanged::class]);
        $reviewer = User::factory()->reviewer()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $otherAssignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create();
        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $assignee->uuid,
            'field_validation_target_date' => '2026-09-01',
            'expected_version' => 0,
        ])->assertOk();

        $this->assertCount(1, $assignee->notifications()->get());
        $notification = $assignee->notifications()->sole();
        $this->assertSame(FieldValidationAssignedNotification::class, $notification->type);
        $this->assertSame('field_validation_assigned', $notification->data['event_type']);
        $this->assertSame('2026-09-01', $notification->data['target_visit_date']);
        $this->assertCount(0, $otherAssignee->notifications()->get());

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $assignee->uuid,
            'field_validation_target_date' => '2026-09-01',
            'expected_version' => 1,
        ])->assertOk();
        $this->assertCount(1, $assignee->notifications()->get());

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $assignee->uuid,
            'field_validation_target_date' => '2026-09-02',
            'expected_version' => 2,
        ])->assertOk();

        $this->assertCount(2, $assignee->notifications()->get());
        $this->assertTrue(
            $assignee->notifications()->get()->contains(
                fn (DatabaseNotification $item): bool => $item->type === FieldValidationAssignmentChangedNotification::class,
            ),
        );

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $otherAssignee->uuid,
            'field_validation_target_date' => '2026-09-03',
            'expected_version' => 3,
        ])->assertOk();

        $this->assertCount(1, $otherAssignee->notifications()->get());
        $this->assertCount(2, $assignee->notifications()->get());
        Event::assertDispatchedTimes(CaseAttentionChanged::class, 3);
    }

    public function test_field_validation_completion_notifies_all_office_users_and_not_the_field_reporter(): void
    {
        Storage::fake('local');
        Event::fake([CaseAttentionChanged::class]);
        $reviewer = User::factory()->reviewer()->create();
        $admin = User::factory()->admin()->create();
        $assignee = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        Sanctum::actingAs($assignee, ['assignment:complete']);

        $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", [
            'client_uuid' => fake()->uuid(),
            'field_observation' => 'Fresh observation.',
            'field_finding' => 'Field finding.',
            'action_taken' => 'Guidance provided.',
            'visited_at' => '2026-09-02T04:05:06.123Z',
            'gps_outcome' => 'unavailable',
            'gps_attempted_at' => '2026-09-02T04:05:01.123Z',
        ])->assertCreated();

        foreach ([$reviewer, $admin] as $recipient) {
            $notification = $recipient->notifications()->sole();
            $this->assertSame(FieldValidationCompletedNotification::class, $notification->type);
            $this->assertSame($assignment->uuid, $notification->data['assignment_uuid']);
        }
        $this->assertCount(0, $assignee->notifications()->get());
        Event::assertDispatchedTimes(CaseAttentionChanged::class, 2);
    }

    public function test_follow_up_due_is_derived_only_from_an_overdue_target_date_and_is_idempotent(): void
    {
        $assignee = User::factory()->fieldReporter()->create();
        $reviewer = User::factory()->reviewer()->create();
        $admin = User::factory()->admin()->create();
        $report = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'case_state' => Report::CASE_STATE_OPEN,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => now()->subDay()->toDateString(),
        ]);
        $noDateReport = Report::factory()->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'case_state' => Report::CASE_STATE_OPEN,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $noDateReport->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => null,
        ]);
        Sanctum::actingAs($assignee, ['notification:read']);

        $this->getJson('/api/v1/mobile/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.event_type', FollowUpDueNotification::EVENT_TYPE)
            ->assertJsonPath('data.0.assignment_uuid', $assignment->uuid);
        $this->getJson('/api/v1/mobile/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        Sanctum::actingAs($reviewer);
        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonFragment(['event_type' => FollowUpDueNotification::EVENT_TYPE]);
        $this->assertCount(1, $reviewer->notifications()->get());
        $this->assertCount(1, $admin->notifications()->get());
    }

    public function test_final_office_review_notifies_submitter_and_validator_but_metadata_corrections_are_quiet(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $submitter = User::factory()->fieldReporter()->create();
        $validator = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create([
            'reporter_id' => $submitter,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
        ]);
        FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $validator->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
            'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
            'expected_version' => 0,
        ])->assertOk();

        foreach ([$submitter, $validator] as $recipient) {
            $notification = $recipient->notifications()->sole();
            $this->assertSame(OfficeReviewCompletedNotification::class, $notification->type);
            $this->assertSame($report->uuid, $notification->data['report_uuid']);
        }

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'metadata_corrections' => ['barangay' => 'Poblacion'],
            'correction_reason' => 'Corrected the office transcription.',
            'expected_version' => 1,
        ])->assertOk();
        $this->assertCount(1, $submitter->notifications()->get());
        $this->assertCount(1, $validator->notifications()->get());
    }

    public function test_mobile_notification_feed_is_owner_scoped_and_preserves_server_read_state(): void
    {
        $owner = User::factory()->fieldReporter()->create();
        $other = User::factory()->fieldReporter()->create();
        $notification = $this->createNotification($owner, 'CG-20260817-MOBILE');
        $token = $owner->createToken('notification-read', ['notification:read'])->plainTextToken;

        $response = $this->withToken($token)
            ->getJson('/api/v1/mobile/notifications')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'event_type', 'case', 'assignment_uuid', 'is_read', 'read_at', 'created_at']],
                'links',
                'meta',
                'sync' => ['before'],
            ])
            ->assertJsonPath('data.0.id', $notification->id)
            ->assertJsonPath('data.0.is_read', false);
        $this->assertSame(
            array_keys(MobileNotificationContract::definition()['fields']),
            array_keys($response->json('data.0')),
        );

        $notification->markAsRead();
        $this->withToken($token)
            ->getJson('/api/v1/mobile/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.is_read', true)
            ->assertJsonPath('data.0.read_at', $notification->fresh()->read_at->utc()->toISOString());

        $otherToken = $other->createToken('notification-owner', ['notification:read'])->plainTextToken;
        Auth::forgetGuards();
        $this->withToken($otherToken)
            ->getJson('/api/v1/mobile/notifications')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_private_channel_authorization_requires_the_matching_web_user_role(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(random_bytes(32)),
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => 'test-app',
        ]);
        require base_path('routes/channels.php');
        $reviewer = User::factory()->reviewer()->create();
        $otherReviewer = User::factory()->reviewer()->create();
        $fieldReporter = User::factory()->fieldReporter()->create();

        $this->actingAs($reviewer, 'web')->assertAuthenticatedAs($reviewer, 'web');
        $response = $this->postJson('/broadcasting/auth', [
            'socket_id' => '123.456',
            'channel_name' => "private-users.{$reviewer->uuid}",
        ]);
        $response->assertOk()->assertJsonStructure(['auth']);

        $this->actingAs($reviewer, 'web')
            ->postJson('/broadcasting/auth', [
                'socket_id' => '123.456',
                'channel_name' => "private-users.{$otherReviewer->uuid}",
            ])
            ->assertForbidden();

        $this->actingAs($fieldReporter, 'web')
            ->postJson('/broadcasting/auth', [
                'socket_id' => '123.456',
                'channel_name' => "private-users.{$fieldReporter->uuid}",
            ])
            ->assertForbidden();
    }

    public function test_broadcast_dispatch_failure_does_not_break_a_submitted_case(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->fieldReporter()->create();
        User::factory()->reviewer()->create();
        $token = $reporter->createToken('degraded-broadcast-upload')->plainTextToken;
        Event::listen(NewCaseSubmitted::class, function (): never {
            throw new \RuntimeException('Reverb is unavailable.');
        });

        try {
            $this->withToken($token)
                ->withHeader('Accept', 'application/json')
                ->post('/api/v1/mobile/reports', $this->payload(fake()->uuid()))
                ->assertCreated();

            $this->assertDatabaseCount('reports', 1);
            $this->assertDatabaseCount('notifications', 1);
        } finally {
            Event::forget(NewCaseSubmitted::class);
        }
    }

    private function createNotification(User $recipient, string $referenceCode): DatabaseNotification
    {
        $recipient->notify(new NewCaseSubmittedNotification(
            fake()->uuid(),
            $referenceCode,
        ));

        return $recipient->notifications()->latest()->firstOrFail();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $clientUuid): array
    {
        $image = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            strict: true,
        );

        return [
            'client_uuid' => $clientUuid,
            'image' => UploadedFile::fake()->createWithContent('leaf.png', $image),
            'image_source_type' => 'camera',
            'source_width' => 1,
            'source_height' => 1,
            'predicted_label' => 'rust',
            'confidence' => 0.82,
            'class_scores' => [
                'healthy' => 0.08,
                'mosaic' => 0.10,
                'rust' => 0.82,
            ],
            'symptom_keys' => ['rust'],
            'checklist_consistency' => 'consistent',
            'reported_severity' => 'moderate',
            'quality_warnings' => ['low-resolution'],
            'barangay' => 'Mabini',
            'model_version' => 'caneguard-mobile-v1.0.0',
            'preprocess_ms' => 12.5,
            'inference_ms' => 95.75,
            'total_ms' => 122.25,
            'captured_at' => '2026-07-20T10:00:00.456+08:00',
        ];
    }
}
