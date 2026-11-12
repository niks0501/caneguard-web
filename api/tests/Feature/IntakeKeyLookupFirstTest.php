<?php

namespace Tests\Feature;

use App\Events\NewCaseSubmitted;
use App\Http\Middleware\EnsureInspectorAccess;
use App\Http\Middleware\ReplayAcceptedIntake;
use App\Models\DistrictMembership;
use App\Models\FieldSurvey;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Http\Middleware\CheckAbilities;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A resend of an already accepted record is answered from its client key
 * before the access, validation and domain checks (NET-3 web intake R4).
 */
class IntakeKeyLookupFirstTest extends TestCase
{
    use RefreshDatabase;

    private const SURVEY = '/api/v1/mobile/field-surveys';

    /** Test 1: report, then revocation, then the same key. */
    public function test_report_resend_after_revocation_returns_the_minimal_receipt_without_side_effects(): void
    {
        Storage::fake('local');
        Event::fake([NewCaseSubmitted::class]);
        User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('phone', ['report:submit'])->plainTextToken;
        $key = (string) Str::uuid();

        $created = $this->tokenAs($token)->post('/api/v3/mobile/reports', $this->reportPayload($key))->assertCreated();
        $uuid = $created->json('data.identity.uuid');
        $notifications = $reporter->notifications()->count() + DatabaseNotification::query()->count();
        Event::assertDispatchedTimes(NewCaseSubmitted::class, 1);
        DistrictMembership::query()->where('user_id', $reporter->getKey())->update(['revoked_at' => now()]);

        foreach (['/api/v1/mobile/reports', '/api/v2/mobile/reports', '/api/v3/mobile/reports'] as $path) {
            $this->tokenAs($token)->post($path, $this->reportPayload($key))
                ->assertOk()
                ->assertJsonPath('data.identity.uuid', $uuid)
                ->assertJsonPath('data.identity.client_uuid', $key)
                ->assertJsonPath('replayed', true)
                ->assertJsonMissingPath('data.review')
                ->assertJsonMissingPath('data.model');
        }

        $this->assertDatabaseCount('reports', 1);
        $this->assertSame($notifications, DatabaseNotification::query()->count());
        Event::assertDispatchedTimes(NewCaseSubmitted::class, 1);
        $this->assertCount(1, Storage::disk('local')->allFiles('reports'));
    }

    /** A revoked reporter's first send of an unknown key is still refused. */
    public function test_revoked_reporter_with_an_unknown_key_is_still_refused(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('phone', ['report:submit'])->plainTextToken;
        DistrictMembership::query()->where('user_id', $reporter->getKey())->update(['revoked_at' => now()]);

        $this->tokenAs($token)->post('/api/v3/mobile/reports', $this->reportPayload((string) Str::uuid()))
            ->assertForbidden();
        $this->assertDatabaseCount('reports', 0);
    }

    /** Test 2: completion after reassignment, and after the case closes. */
    public function test_completion_resend_after_reassignment_or_case_closure_returns_the_receipt(): void
    {
        [$assignee, $assignment, $payload] = $this->assignmentAndPayload();
        $this->actAs($assignee, ['assignment:complete']);
        $path = "/api/v1/mobile/assignments/{$assignment->uuid}/completion";
        $this->post($path, $payload)->assertCreated();
        $completion = FieldValidationCompletion::query()->sole();
        $this->assertSame($assignee->getKey(), $completion->completed_by_id);
        $notifications = DatabaseNotification::query()->count();

        $other = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $assignment->update(['assignee_id' => $other->getKey()]);
        $this->actAs($assignee, ['assignment:complete']);
        $this->post($path, $payload)->assertOk()
            ->assertJsonPath('data.completion.uuid', $completion->uuid)
            ->assertJsonPath('data.completion.client_uuid', $payload['client_uuid'])
            ->assertJsonPath('replayed', true)
            ->assertJsonMissingPath('data.case');

        $assignment->report->update(['case_state' => Report::CASE_STATE_CLOSED]);
        DistrictMembership::query()->where('user_id', $assignee->getKey())->update(['revoked_at' => now()]);
        $this->post($path, $payload)->assertOk()->assertJsonPath('data.completion.uuid', $completion->uuid);

        $this->assertDatabaseCount('field_validation_completions', 1);
        $this->assertSame($notifications, DatabaseNotification::query()->count());
    }

    /** Test 3: boundary resend with an invalid body after the first send landed. */
    public function test_boundary_resend_with_an_invalid_body_returns_the_receipt_not_a_422(): void
    {
        $inspector = User::factory()->inDistrict($this->pilotDistrict())->create();
        $this->actAs($inspector, ['report:submit']);
        $payload = $this->surveyPayload();
        $id = $this->postJson(self::SURVEY, $payload)->assertCreated()->json('id');
        $before = FieldSurvey::query()->sole()->getRawOriginal();

        $this->postJson(self::SURVEY, ['client_uuid' => strtoupper($payload['client_uuid']), 'polygon' => 'garbage', 'district_code' => 'foreign'])
            ->assertOk()
            ->assertJsonPath('id', $id)
            ->assertJsonPath('status', 'kept')
            ->assertJsonPath('replayed', true);

        DistrictMembership::query()->where('user_id', $inspector->getKey())->update(['revoked_at' => now()]);
        $this->postJson(self::SURVEY, $payload)->assertOk()->assertJsonPath('id', $id);

        $this->assertDatabaseCount('field_surveys', 1);
        $this->assertSame($before, FieldSurvey::query()->sole()->getRawOriginal());
    }

    /** Test 4: a competing first send that loses the race gets the winner's identity. */
    public function test_competing_first_sends_leave_one_row_and_one_identity(): void
    {
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('phone', ['report:submit'])->plainTextToken;
        $key = (string) Str::uuid();
        $winner = Report::factory()->inDistrict($this->pilotDistrict())->create(['reporter_id' => $reporter->getKey(), 'client_uuid' => $key]);

        $this->tokenAs($token)->post('/api/v3/mobile/reports', $this->reportPayload($key))
            ->assertOk()->assertJsonPath('data.identity.uuid', $winner->uuid);

        $survey = $this->surveyPayload();
        $inspector = User::factory()->inDistrict($this->pilotDistrict())->create();
        $this->actAs($inspector, ['report:submit']);
        $first = $this->postJson(self::SURVEY, $survey)->json('id');
        $this->postJson(self::SURVEY, $survey)->assertJsonPath('id', $first);

        [$assignee, $assignment, $payload] = $this->assignmentAndPayload();
        $this->actAs($assignee, ['assignment:complete']);
        $path = "/api/v1/mobile/assignments/{$assignment->uuid}/completion";
        $one = $this->post($path, $payload)->json('data.completion.uuid');
        $this->post($path, $payload)->assertJsonPath('data.completion.uuid', $one);

        $this->assertSame(1, Report::query()->where('client_uuid', $key)->count());
        $this->assertDatabaseCount('field_surveys', 1);
        $this->assertDatabaseCount('field_validation_completions', 1);
    }

    /** Test 5: the same key from a second user leaks no receipt. */
    public function test_a_key_owned_by_someone_else_is_refused_without_a_receipt(): void
    {
        $inspector = User::factory()->inDistrict($this->pilotDistrict())->create();
        $this->actAs($inspector, ['report:submit']);
        $survey = $this->surveyPayload();
        $this->postJson(self::SURVEY, $survey)->assertCreated();
        $second = User::factory()->inDistrict($this->pilotDistrict())->create();
        $this->actAs($second, ['report:submit']);
        $this->postJson(self::SURVEY, $survey)->assertUnprocessable()
            ->assertJsonValidationErrors('client_uuid')->assertJsonMissingPath('id');

        [$assignee, $assignment, $payload] = $this->assignmentAndPayload();
        $this->actAs($assignee, ['assignment:complete']);
        $path = "/api/v1/mobile/assignments/{$assignment->uuid}/completion";
        $this->post($path, $payload)->assertCreated();
        $stranger = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $this->actAs($stranger, ['assignment:complete']);
        $this->post($path, $payload)->assertConflict()
            ->assertJsonPath('code', 'CLIENT_UUID_CONFLICT')->assertJsonMissingPath('data');

        $this->actAs($assignee, ['assignment:complete']);
        $otherAssignment = FieldValidationAssignment::factory()->create([
            'report_id' => Report::factory()->inDistrict($this->pilotDistrict())->create([
                'reporter_id' => User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create()->getKey(),
                'case_state' => Report::CASE_STATE_OPEN,
            ])->getKey(), 'assignee_id' => $assignee->getKey(),
        ]);
        $this->post("/api/v1/mobile/assignments/{$otherAssignment->uuid}/completion", $payload)
            ->assertConflict()->assertJsonPath('code', 'CLIENT_UUID_CONFLICT');

        // Report keys are owner-scoped: another reporter's resend of the key is a new record.
        Storage::fake('local');
        Auth::forgetGuards();
        $key = (string) Str::uuid();
        $a = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $b = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $uuid = $this->tokenAs($a->createToken('p', ['report:submit'])->plainTextToken)
            ->post('/api/v3/mobile/reports', $this->reportPayload($key))->assertCreated()->json('data.identity.uuid');
        $this->tokenAs($b->createToken('p', ['report:submit'])->plainTextToken)
            ->post('/api/v3/mobile/reports', $this->reportPayload($key))->assertCreated()
            ->assertJsonMissingPath('replayed');
        $this->assertSame(2, Report::query()->where('client_uuid', $key)->count());
        $this->assertNotSame($uuid, Report::query()->where('reporter_id', $b->getKey())->value('uuid'));
    }

    /** Test 7: the key lookup runs before the access check on every intake route. */
    public function test_replay_middleware_precedes_inspector_access_on_every_intake_route(): void
    {
        $routes = [
            ['POST', 'api/v1/mobile/field-surveys'],
            ['POST', 'api/v1/mobile/reports'],
            ['POST', 'api/v2/mobile/reports'],
            ['POST', 'api/v3/mobile/reports'],
            ['POST', 'api/v1/mobile/assignments/{assignment}/completion'],
        ];

        foreach ($routes as [$method, $uri]) {
            $route = Route::getRoutes()->match(
                Request::create(str_replace('{assignment}', (string) Str::uuid(), $uri), $method)
            );
            $order = array_map(
                fn ($m) => is_string($m) ? explode(':', $m)[0] : $m,
                app('router')->resolveMiddleware($route->gatherMiddleware(), $route->excludedMiddleware()),
            );
            $replay = array_search(ReplayAcceptedIntake::class, $order, true);
            $access = array_search(EnsureInspectorAccess::class, $order, true);
            $this->assertNotFalse($replay, "{$uri} lacks intake.replay");
            $this->assertNotFalse($access, "{$uri} lacks inspector.access");
            $this->assertLessThan($access, $replay, "{$uri} looks up the key after the access check");
            $this->assertNotFalse(array_search(CheckAbilities::class, $order, true));
            $this->assertLessThan(array_search(CheckAbilities::class, $order, true), $replay);
        }
    }

    /** The completer column backfills existing completions with the assignee of record. */
    public function test_completed_by_backfill_uses_the_assignee_of_record_and_rolls_back(): void
    {
        [$assignee, $assignment, $payload] = $this->assignmentAndPayload();
        $this->actAs($assignee, ['assignment:complete']);
        $this->post("/api/v1/mobile/assignments/{$assignment->uuid}/completion", $payload)->assertCreated();
        $migration = require database_path('migrations/2026_11_13_000000_add_completed_by_id_to_field_validation_completions_table.php');

        $migration->down();
        $this->assertFalse(Schema::hasColumn('field_validation_completions', 'completed_by_id'));
        $migration->up();

        $this->assertSame($assignee->getKey(), FieldValidationCompletion::query()->sole()->completed_by_id);
    }

    /**
     * @param  list<string>  $abilities
     */
    private function actAs(User $user, array $abilities): void
    {
        Auth::forgetGuards();
        $this->flushHeaders();
        Sanctum::actingAs($user, $abilities);
    }

    private function tokenAs(string $token): static
    {
        Auth::forgetGuards();
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    /**
     * @return array{0: User, 1: FieldValidationAssignment, 2: array<string, mixed>}
     */
    private function assignmentAndPayload(): array
    {
        $district = $this->pilotDistrict();
        $assignee = User::factory()->inDistrict($district)->fieldReporter()->create();
        $report = Report::factory()->inDistrict($district)->create([
            'reporter_id' => User::factory()->inDistrict($district)->fieldReporter()->create()->getKey(),
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => User::factory()->inDistrict($district)->reviewer()->create()->getKey(),
        ]);

        return [$assignee, $assignment, [
            'client_uuid' => (string) Str::uuid(),
            'field_observation' => 'Fresh observation from the assigned visit.',
            'field_finding' => 'The field finding is preserved as separate evidence.',
            'action_taken' => 'Provided field guidance and recorded the next action.',
            'visited_at' => '2026-09-02T04:05:06.123Z',
            'gps_outcome' => 'low_accuracy',
            'gps_attempted_at' => '2026-09-02T04:05:01.123Z',
            'gps_latitude' => 14.0667,
            'gps_longitude' => 120.6319,
            'gps_accuracy' => 38,
        ]];
    }

    /**
     * @return array<string, mixed>
     */
    private function surveyPayload(): array
    {
        return [
            'client_uuid' => (string) Str::uuid(),
            'polygon' => ['type' => 'Polygon', 'coordinates' => [[
                [122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7],
            ]]],
            'area_sqm' => 6075.123,
            'captured_at' => '2026-10-04T10:30:12.123456+08:00',
            'district_code' => 'test-pilot',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function reportPayload(string $key): array
    {
        $image = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true);

        return [
            'client_uuid' => $key,
            'image' => UploadedFile::fake()->createWithContent('leaf.png', $image),
            'image_source_type' => 'camera',
            'source_width' => 1,
            'source_height' => 1,
            'predicted_label' => Report::LABEL_SMUT,
            'confidence' => 0.97,
            'class_scores' => ['healthy' => 0.01, 'mosaic' => 0.01, 'rust' => 0.01, 'smut' => 0.97],
            'symptom_keys' => [Report::LABEL_SMUT],
            'reporter_observation_text' => 'Dark whip-like growths are visible.',
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
