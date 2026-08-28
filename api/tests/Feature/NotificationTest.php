<?php

namespace Tests\Feature;

use App\Events\NewCaseSubmitted;
use App\Models\User;
use App\Notifications\NewCaseSubmittedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Notifications\DatabaseNotification;
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
