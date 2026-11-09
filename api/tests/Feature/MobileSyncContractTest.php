<?php

namespace Tests\Feature;

use App\Actions\Notifications\CreateLifecycleNotifications;
use App\Http\Resources\MobileNotificationResource;
use App\Models\Advisory;
use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use App\Notifications\AdvisoryAvailableNotification;
use App\Notifications\CaseAttentionNotification;
use App\Notifications\FieldValidationAssignedNotification;
use App\Notifications\FieldValidationAssignmentChangedNotification;
use App\Notifications\FieldValidationCompletedNotification;
use App\Notifications\FollowUpDueNotification;
use App\Notifications\NewCaseSubmittedNotification;
use App\Notifications\NotificationPayload;
use App\Notifications\OfficeReviewCompletedNotification;
use App\Notifications\WeeklyReportReminderNotification;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Proposal test (not proof). Proves L0: no server-produced notification or
 * seeded assignment fails the mobile contract JSON, and seeded cases are office-born.
 */
class MobileSyncContractTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => 'test-pilot',
        ]);
        Storage::fake('local');
    }

    public function test_every_notification_class_serializes_within_the_mobile_contract(): void
    {
        $samples = $this->notificationSamples();

        $declared = collect(glob(app_path('Notifications/*Notification.php')))
            ->map(fn (string $file): string => 'App\\Notifications\\'.basename($file, '.php'))
            ->reject(fn (string $class): bool => (new \ReflectionClass($class))->isAbstract())
            ->sort()->values()->all();
        $covered = collect(array_keys($samples))->sort()->values()->all();
        $this->assertSame($declared, $covered, 'Every notification class needs a contract sample.');

        $contract = $this->contract('mobile-notifications-v1');
        $recipient = User::factory()->fieldReporter()->create();
        foreach ($samples as $class => $notification) {
            $row = $this->serialize($notification, $recipient);
            $this->assertContract($contract['fields'], $row, $class);
            $this->assertNotSame('', trim($row['title']), "{$class} title");
            $this->assertNotSame('', trim($row['message']), "{$class} message");
        }
    }

    public function test_producers_refuse_empty_or_oversized_title_and_message(): void
    {
        $recipient = User::factory()->fieldReporter()->create();
        $uuid = (string) Str::uuid();

        foreach (['', '   '] as $blank) {
            $notification = new class($uuid, $uuid, 'REF-1', 'x', $blank, 'body', null, 'k') extends CaseAttentionNotification {};
            $this->assertRefused(fn () => $notification->toDatabase($recipient));
            $notification = new class($uuid, $uuid, 'REF-1', 'x', 'title', $blank, null, 'k') extends CaseAttentionNotification {};
            $this->assertRefused(fn () => $notification->toDatabase($recipient));
        }
        $this->assertRefused(fn () => NotificationPayload::assertDeliverable([
            'event_type' => 'x', 'title' => str_repeat('a', 161), 'message' => 'm',
        ]));
        $this->assertRefused(fn () => NotificationPayload::assertDeliverable([
            'event_type' => 'x', 'title' => 't', 'message' => str_repeat('a', 501),
        ]));
    }

    public function test_resource_never_emits_an_empty_title_or_message_for_legacy_rows(): void
    {
        $recipient = User::factory()->fieldReporter()->create();
        $row = (new DatabaseNotification([
            'id' => (string) Str::uuid(),
            'type' => 'legacy',
            'data' => ['event_type' => 'legacy', 'title' => '', 'message' => ''],
        ]))->setRelation('notifiable', $recipient);
        $row->created_at = Carbon::now();

        $payload = (new MobileNotificationResource($row))->toArray(Request::create('/'));

        $this->assertNotSame('', trim($payload['title']));
        $this->assertNotSame('', trim($payload['message']));
    }

    public function test_seeded_cases_are_office_born_with_valid_identities_and_assignments_pass_the_contract(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->approveSeededPilotFixtures();

        $reports = Report::query()->with('reporter')->get();
        $this->assertNotEmpty($reports);
        foreach ($reports as $report) {
            $this->assertSame(Report::ORIGIN_OFFICE, $report->origin, $report->reference_code);
            $this->assertTrue(Str::isUuid((string) $report->uuid), $report->reference_code);
            $this->assertTrue(Str::isUuid((string) $report->client_uuid), $report->reference_code);
            $this->assertNotSame('', trim((string) $report->reference_code));
            $this->assertNotNull($report->reporter, $report->reference_code);
        }

        $assignmentContract = $this->contract('mobile-field-validation-assignment-v1');
        $notificationContract = $this->contract('mobile-notifications-v1');
        $lifecycle = app(CreateLifecycleNotifications::class);
        FieldValidationAssignment::query()->each(fn (FieldValidationAssignment $a) => $lifecycle->assignmentCreated($a));

        $assignee = User::query()->where('email', 'field@caneguard.test')->firstOrFail();
        Sanctum::actingAs($assignee, ['assignment:read', 'notification:read']);

        $assignments = $this->getJson('/api/v1/mobile/assignments?per_page=100')->assertOk()->json('data');
        $this->assertNotEmpty($assignments);
        foreach ($assignments as $row) {
            $this->assertContract($assignmentContract['fields'], $row, 'assignment '.($row['reference_code'] ?? '?'));
        }

        $notifications = $this->getJson('/api/v1/mobile/notifications')->assertOk()->json('data');
        $this->assertNotEmpty($notifications);
        foreach ($notifications as $row) {
            $this->assertContract($notificationContract['fields'], $row, 'notification '.$row['id']);
        }
    }

    /** @return array<class-string, Notification> */
    private function notificationSamples(): array
    {
        $uuid = (string) Str::uuid();
        $advisory = Advisory::factory()->validated()->create();

        return [
            AdvisoryAvailableNotification::class => new AdvisoryAvailableNotification($uuid, $uuid, 'BGO-20260916-0745', $advisory, '1'),
            FieldValidationAssignedNotification::class => new FieldValidationAssignedNotification($uuid, $uuid, 'BGO-20260916-0745', $uuid, '2026-11-12'),
            FieldValidationAssignmentChangedNotification::class => new FieldValidationAssignmentChangedNotification($uuid, $uuid, 'BGO-20260916-0745', $uuid, null, 'c1'),
            FieldValidationCompletedNotification::class => new FieldValidationCompletedNotification($uuid, $uuid, 'BGO-20260916-0745', $uuid, $uuid),
            FollowUpDueNotification::class => new FollowUpDueNotification($uuid, $uuid, 'BGO-20260916-0745', $uuid, '2026-11-01'),
            NewCaseSubmittedNotification::class => new NewCaseSubmittedNotification($uuid, 'BGO-20260916-0745'),
            OfficeReviewCompletedNotification::class => new OfficeReviewCompletedNotification($uuid, $uuid, 'BGO-20260916-0745', null, '1'),
            WeeklyReportReminderNotification::class => new WeeklyReportReminderNotification($uuid, '2026-W44', WeeklyReportReminderNotification::STATE_NOT_PREPARED),
        ];
    }

    /** @return array<string, mixed> */
    private function serialize(Notification $notification, User $recipient): array
    {
        $row = new DatabaseNotification([
            'id' => $notification->id ?? (string) Str::uuid(),
            'type' => $notification::class,
            'data' => $notification->toDatabase($recipient),
        ]);
        $row->created_at = Carbon::now();

        return json_decode((new MobileNotificationResource($row))->toJson(), true, 512, JSON_THROW_ON_ERROR);
    }

    private function assertRefused(callable $produce): void
    {
        try {
            $produce();
        } catch (InvalidArgumentException) {
            $this->addToAssertionCount(1);

            return;
        }
        $this->fail('The producer emitted a payload the mobile contract rejects.');
    }

    /** @return array<string, mixed> */
    private function contract(string $name): array
    {
        return json_decode(
            (string) file_get_contents(base_path("../docs/contracts/{$name}.json")),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
    }

    /**
     * @param  array<string, array<string, mixed>>  $fields
     * @param  array<string, mixed>  $row
     */
    private function assertContract(array $fields, array $row, string $label): void
    {
        foreach ($fields as $name => $spec) {
            if (! array_key_exists($name, $row)) {
                $this->assertFalse($spec['required'], "{$label}: missing required {$name}");

                continue;
            }
            $this->assertValue($spec, $row[$name], "{$label}.{$name}");
        }
        $this->assertSame([], array_diff(array_keys($row), array_keys($fields)), "{$label}: undeclared fields");
    }

    /** @param  array<string, mixed>  $spec */
    private function assertValue(array $spec, mixed $value, string $path): void
    {
        if ($value === null) {
            $this->assertTrue($spec['nullable'], "{$path} is null but not nullable");

            return;
        }

        switch ($spec['type']) {
            case 'uuid':
                $this->assertTrue(is_string($value) && Str::isUuid($value), "{$path} is not a uuid");
                break;
            case 'string':
                $this->assertIsString($value, $path);
                $this->assertNotSame('', trim($value), "{$path} is blank");
                if (isset($spec['max_length'])) {
                    $this->assertLessThanOrEqual($spec['max_length'], mb_strlen($value), "{$path} too long");
                }
                if (isset($spec['enum'])) {
                    $this->assertContains($value, $spec['enum'], "{$path} enum");
                }
                if (($spec['format'] ?? null) === 'date') {
                    $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', $value, $path);
                }
                break;
            case 'boolean':
                $this->assertIsBool($value, $path);
                break;
            case 'number':
                $this->assertTrue(is_int($value) || is_float($value), "{$path} is not a number");
                if (isset($spec['minimum'])) {
                    $this->assertGreaterThanOrEqual($spec['minimum'], $value, $path);
                }
                if (isset($spec['maximum'])) {
                    $this->assertLessThanOrEqual($spec['maximum'], $value, $path);
                }
                break;
            case 'date-time':
                $this->assertTrue(is_string($value) && strtotime($value) !== false, "{$path} is not a date-time");
                break;
            case 'object':
                $this->assertIsArray($value, $path);
                foreach ($spec['required_keys'] as $key) {
                    $this->assertArrayHasKey($key, $value, "{$path}.{$key}");
                }
                foreach ($spec['properties'] as $key => $child) {
                    if (array_key_exists($key, $value)) {
                        $this->assertValue($child, $value[$key], "{$path}.{$key}");
                    }
                }
                if (($spec['additional_properties'] ?? true) === false) {
                    $this->assertSame([], array_diff(array_keys($value), array_keys($spec['properties'])), "{$path} undeclared keys");
                }
                break;
            default:
                $this->fail("{$path}: unknown contract type {$spec['type']}");
        }
    }
}
