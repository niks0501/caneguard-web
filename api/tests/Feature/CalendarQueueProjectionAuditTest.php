<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CalendarQueueProjectionAuditTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function assertProductionFrontendSchemaAccepts(array $payload): void
    {
        $process = proc_open(
            ['node', 'scripts/validate-field-validation-queue-response.mjs'],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            base_path('..'),
        );

        $this->assertIsResource($process, 'Could not start the production frontend schema validator.');
        fwrite($pipes[0], json_encode($payload, JSON_THROW_ON_ERROR));
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);

        $this->assertSame(0, $exitCode, $stderr ?: $stdout);
    }

    private function visit(User $reviewer, User $assignee, string $reference, ?string $date, int $version): Report
    {
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => $reference,
            'case_state' => Report::CASE_STATE_OPEN,
            'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'lock_version' => $version,
            'observed_at' => '2026-10-01 00:00:00',
            'submitted_at' => '2026-10-01 00:00:00',
        ]);

        FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => $date,
        ]);

        return $report;
    }

    public function test_nonempty_queue_projects_zero_and_positive_persisted_versions_on_both_pages(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $assignee = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $zero = $this->visit($reviewer, $assignee, 'CG-QUEUE-VERSION-ZERO', '2026-10-10', 0);
        $positive = $this->visit($reviewer, $assignee, 'CG-QUEUE-VERSION-POSITIVE', '2026-10-11', 7);
        Sanctum::actingAs($reviewer);

        $pageOne = $this->getJson('/api/v1/reports/field-validation-queue?queue=needs_visit&limit=1&page=1');
        $pageOne
            ->assertOk()
            ->assertJsonPath('data.count', 2)
            ->assertJsonPath('data.oldest.uuid', $zero->uuid)
            ->assertJsonPath('data.oldest.version', 0)
            ->assertJsonPath('data.items.0.version', 0);
        $this->assertProductionFrontendSchemaAccepts($pageOne->json());

        $pageTwo = $this->getJson('/api/v1/reports/field-validation-queue?queue=needs_visit&limit=1&page=2');
        $pageTwo
            ->assertOk()
            ->assertJsonPath('data.page', 2)
            ->assertJsonPath('data.oldest.uuid', $positive->uuid)
            ->assertJsonPath('data.oldest.version', 7)
            ->assertJsonPath('data.items.0.version', 7);
        $this->assertProductionFrontendSchemaAccepts($pageTwo->json());
    }

    public function test_all_calendar_queue_reads_project_versions_and_empty_queue_remains_valid(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-07T12:00:00Z'));
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $assignee = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $overdue = $this->visit($reviewer, $assignee, 'CG-QUEUE-OVERDUE', '2026-10-06', 3);
        $upcoming = $this->visit($reviewer, $assignee, 'CG-QUEUE-UPCOMING', '2026-10-08', 9);
        Sanctum::actingAs($reviewer);

        $versions = [$overdue->uuid => 3, $upcoming->uuid => 9];
        foreach (['needs_visit', 'follow_up_due', 'upcoming'] as $queue) {
            $response = $this->getJson('/api/v1/reports/field-validation-queue?queue='.$queue);
            $response->assertOk();
            $payload = $response->json();
            $this->assertSame($payload['data']['items'][0]['uuid'], $payload['data']['oldest']['uuid']);
            $this->assertSame($payload['data']['items'][0]['version'], $payload['data']['oldest']['version']);
            foreach ($payload['data']['items'] as $item) {
                $this->assertSame($versions[$item['uuid']], $item['version']);
            }
            if (isset($versions[$payload['data']['oldest']['uuid']])) {
                $this->assertSame($versions[$payload['data']['oldest']['uuid']], $payload['data']['oldest']['version']);
            }
            if ($queue === 'follow_up_due') {
                $this->assertSame($overdue->uuid, $payload['data']['oldest']['uuid']);
            } elseif ($queue === 'upcoming') {
                $this->assertSame($upcoming->uuid, $payload['data']['oldest']['uuid']);
            }
            $this->assertProductionFrontendSchemaAccepts($payload);
        }

        Report::query()->whereIn('id', [$overdue->getKey(), $upcoming->getKey()])->update([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_COMPLETED,
        ]);

        $this->getJson('/api/v1/reports/field-validation-queue?queue=needs_visit')
            ->assertOk()
            ->assertJsonPath('data.count', 0)
            ->assertJsonPath('data.oldest', null)
            ->assertJsonPath('data.items', []);
    }

    public function test_version_protected_reschedule_is_reflected_by_the_calendar_queue_read(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $assignee = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $report = $this->visit($reviewer, $assignee, 'CG-CALENDAR-REFRESH-VERSION', '2026-10-10', 4);
        Sanctum::actingAs($reviewer);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $assignee->uuid,
            'field_validation_target_date' => '2026-10-12',
            'correction_reason' => 'Visit rescheduled after coordination.',
            'expected_version' => 3,
        ])->assertStatus(409);

        $report->refresh();
        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_validation_assignee_uuid' => $assignee->uuid,
            'field_validation_target_date' => '2026-10-12',
            'correction_reason' => 'Visit rescheduled after coordination.',
            'expected_version' => 4,
        ])->assertOk();

        $calendarRefresh = $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
            'queue' => 'needs_visit',
            'due_from' => '2026-10-12',
            'due_to' => '2026-10-12',
        ]));
        $calendarRefresh
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.uuid', $report->uuid)
            ->assertJsonPath('data.items.0.target_visit_date', '2026-10-12')
            ->assertJsonPath('data.items.0.version', 5);
        $this->assertProductionFrontendSchemaAccepts($calendarRefresh->json());
    }
}
