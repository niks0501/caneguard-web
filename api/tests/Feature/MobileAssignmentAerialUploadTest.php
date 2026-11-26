<?php

namespace Tests\Feature;

use App\Actions\Reports\BuildReportCaseHistory;
use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\ReportAerialAnalysis;
use App\Models\User;
use App\Support\AerialSwitch;
use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileAssignmentAerialUploadTest extends TestCase
{
    use RefreshDatabase;

    private const SHA = 'bf086c5ea11ecf83bbbbef6df1b515ba341fde2b0d90d23e87728268fcde2bf4';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
        Storage::fake('local');
    }

    private function setAerialFeature(bool $installed, bool $switchedOn): void
    {
        config([
            'caneguard.aerial.enabled' => $installed,
            'caneguard.aerial.model_path' => '/srv/aerial/model.onnx',
            'caneguard.aerial.weights_sha256' => self::SHA,
        ]);
        DB::table('feature_switches')->updateOrInsert(
            ['name' => AerialSwitch::NAME],
            ['enabled' => $switchedOn],
        );
    }

    private function fakeSegmenter(): void
    {
        Process::fake(function (PendingProcess $pending): ProcessResult {
            $maskPath = $pending->command[array_search('--mask-out', $pending->command, true) + 1];
            $mask = imagecreatetruecolor(160, 120);
            $class1 = imagecolorallocate($mask, 1, 1, 1);
            $class2 = imagecolorallocate($mask, 2, 2, 2);
            imagefilledrectangle($mask, 0, 0, 159, 119, $class1);
            imagefilledrectangle($mask, 0, 0, 60, 119, $class2);
            ob_start();
            imagepng($mask);
            $png = (string) ob_get_clean();
            imagedestroy($mask);
            file_put_contents($maskPath, $png);

            return Process::result(json_encode([
                'image_width' => 800,
                'image_height' => 600,
                'mask_width' => 160,
                'mask_height' => 120,
                'normal_canopy_percent' => 76.5,
                'abnormal_canopy_percent' => 23.5,
                'canopy_coverage_percent' => 84.0,
                'model_sha256' => self::SHA,
                'inference_ms' => 410,
            ]));
        });
    }

    /**
     * @return array{reviewer: User, owner: User, report: Report, assignment: FieldValidationAssignment}
     */
    private function seedAssignedCase(array $reportOverrides = []): array
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $owner = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'affected_area_hectares' => 2.5,
            'affected_portion_percent' => 30.0,
            'reported_severity' => 'Moderate',
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            ...$reportOverrides,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $owner->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);

        return compact('reviewer', 'owner', 'report', 'assignment');
    }

    public function test_returns_explicit_409_aerial_disabled_when_switch_is_off(): void
    {
        ['owner' => $owner, 'assignment' => $assignment] = $this->seedAssignedCase();
        $this->setAerialFeature(true, false);

        Sanctum::actingAs($owner, ['assignment:complete']);
        $this->postJson("/api/v1/mobile/assignments/{$assignment->uuid}/aerial-analyses", [
            'client_uuid' => (string) Str::uuid(),
            'image' => UploadedFile::fake()->image('drone.jpg', 800, 600),
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'AERIAL_DISABLED');

        $this->assertDatabaseCount('report_aerial_analyses', 0);
    }

    public function test_inspector_can_upload_drone_photo_which_updates_brief_and_office_history_without_touching_ground_metrics(): void
    {
        ['reviewer' => $reviewer, 'owner' => $owner, 'report' => $report, 'assignment' => $assignment] = $this->seedAssignedCase();
        $this->setAerialFeature(true, true);
        $this->fakeSegmenter();
        $clientUuid = (string) Str::uuid();

        Sanctum::actingAs($owner, ['assignment:complete', 'assignment:read']);
        $response = $this->postJson("/api/v1/mobile/assignments/{$assignment->uuid}/aerial-analyses", [
            'client_uuid' => $clientUuid,
            'image' => UploadedFile::fake()->image('drone-dji.jpg', 800, 600),
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.analysis.client_uuid', $clientUuid)
            ->assertJsonPath('data.analysis.assignment_uuid', $assignment->uuid)
            ->assertJsonPath('data.aerial_check.abnormal_canopy_percent', 23.5)
            ->assertJsonPath('data.aerial_check.canopy_coverage_percent', 84);

        $analysisUuid = $response->json('data.analysis.uuid');
        $this->assertDatabaseHas('report_aerial_analyses', [
            'uuid' => $analysisUuid,
            'client_uuid' => $clientUuid,
            'report_id' => $report->getKey(),
            'uploaded_by' => $owner->getKey(),
        ]);

        // Never Combined: GPS area / portion / severity remain untouched.
        $report->refresh();
        $this->assertSame(2.5, (float) $report->affected_area_hectares);
        $this->assertSame(30.0, (float) $report->affected_portion_percent);
        $this->assertSame('Moderate', $report->reported_severity);

        // Assignment feed immediately reflects the uploaded aerial brief.
        $feedBrief = $this->getJson('/api/v1/mobile/assignments')->assertOk()->json('data.0.aerial_check');
        $this->assertSame($analysisUuid, $feedBrief['uuid']);
        $this->assertSame(23.5, $feedBrief['abnormal_canopy_percent']);

        // Office reviewer sees the uploaded photo attributed to the inspector in Case Review & History.
        Auth::forgetGuards();
        $this->actingAs($reviewer, 'web');
        $casePayload = $this->getJson("/api/v1/reports/{$report->uuid}")->assertOk();
        $casePayload->assertJsonPath('data.aerial_analyses.0.uuid', $analysisUuid);
        $casePayload->assertJsonPath('data.aerial_analyses.0.uploaded_by.uuid', $owner->uuid);

        $history = app(BuildReportCaseHistory::class)->handle(
            $report->fresh(['aerialAnalysisHistory.uploader', 'aerialAnalysisHistory.remover']),
        );
        $aerialEntry = collect($history['entries'])->firstWhere('id', "aerial-upload-{$analysisUuid}");
        $this->assertNotNull($aerialEntry);
        $this->assertSame($owner->name, $aerialEntry['actor']);
    }

    public function test_idempotent_replay_returns_accepted_receipt_even_after_aerial_is_turned_off(): void
    {
        ['owner' => $owner, 'assignment' => $assignment] = $this->seedAssignedCase();
        $this->setAerialFeature(true, true);
        $this->fakeSegmenter();
        $clientUuid = (string) Str::uuid();

        Sanctum::actingAs($owner, ['assignment:complete']);
        $first = $this->postJson("/api/v1/mobile/assignments/{$assignment->uuid}/aerial-analyses", [
            'client_uuid' => $clientUuid,
            'image' => UploadedFile::fake()->image('drone.jpg', 800, 600),
        ])->assertCreated();
        $analysisUuid = $first->json('data.analysis.uuid');

        // Office later disables aerial switch; phone retries with the same client_uuid after a dropped reply.
        $this->setAerialFeature(true, false);
        $ranAfterOff = false;
        Process::fake(function () use (&$ranAfterOff): ProcessResult {
            $ranAfterOff = true;

            return Process::result('', 'should not run', 1);
        });

        $this->postJson("/api/v1/mobile/assignments/{$assignment->uuid}/aerial-analyses", [
            'client_uuid' => $clientUuid,
            'image' => UploadedFile::fake()->image('drone.jpg', 800, 600),
        ])
            ->assertOk()
            ->assertJsonPath('replayed', true)
            ->assertJsonPath('data.analysis.uuid', $analysisUuid)
            ->assertJsonPath('data.analysis.client_uuid', $clientUuid)
            ->assertJsonPath('data.analysis.assignment_uuid', $assignment->uuid);

        $this->assertFalse($ranAfterOff);
        $this->assertSame(1, ReportAerialAnalysis::query()->count());
    }

    public function test_enforces_assignee_ownership_role_ability_closed_case_and_client_uuid_conflict(): void
    {
        ['reviewer' => $reviewer, 'owner' => $owner, 'assignment' => $assignment] = $this->seedAssignedCase();
        $otherInspector = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $farmer = User::factory()->inDistrict($this->pilotDistrict())->farmer()->create();
        $this->setAerialFeature(true, true);
        $this->fakeSegmenter();
        $url = "/api/v1/mobile/assignments/{$assignment->uuid}/aerial-analyses";
        $payload = [
            'client_uuid' => (string) Str::uuid(),
            'image' => UploadedFile::fake()->image('drone.jpg', 800, 600),
        ];

        Sanctum::actingAs($otherInspector, ['assignment:complete']);
        $this->postJson($url, $payload)->assertForbidden();

        Sanctum::actingAs($reviewer, ['assignment:complete']);
        $this->postJson($url, $payload)->assertForbidden();

        Sanctum::actingAs($farmer, ['assignment:complete']);
        $this->postJson($url, $payload)->assertForbidden();

        Sanctum::actingAs($owner, ['assignment:read']);
        $this->postJson($url, $payload)->assertForbidden();

        // Successful upload creates a client_uuid that another inspector/assignment cannot hijack.
        Sanctum::actingAs($owner, ['assignment:complete']);
        $this->postJson($url, $payload)->assertCreated();

        ['owner' => $secondOwner, 'assignment' => $secondAssignment] = $this->seedAssignedCase();
        Sanctum::actingAs($secondOwner, ['assignment:complete']);
        $this->postJson("/api/v1/mobile/assignments/{$secondAssignment->uuid}/aerial-analyses", $payload)
            ->assertStatus(409)
            ->assertJsonPath('code', 'CLIENT_UUID_CONFLICT');

        // Closed cases refuse new aerial uploads with 409 CASE_CLOSED.
        ['owner' => $closedOwner, 'assignment' => $closedAssignment] = $this->seedAssignedCase([
            'case_state' => Report::CASE_STATE_CLOSED,
        ]);
        Sanctum::actingAs($closedOwner, ['assignment:complete']);
        $this->postJson("/api/v1/mobile/assignments/{$closedAssignment->uuid}/aerial-analyses", [
            'client_uuid' => (string) Str::uuid(),
            'image' => UploadedFile::fake()->image('drone.jpg', 800, 600),
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'CASE_CLOSED');
    }

    public function test_switch_turned_off_during_mobile_inference_returns_409_aerial_disabled_and_stores_nothing(): void
    {
        ['owner' => $owner, 'assignment' => $assignment] = $this->seedAssignedCase();
        $this->setAerialFeature(true, true);

        Process::fake(function (PendingProcess $pending): ProcessResult {
            DB::table('feature_switches')->where('name', AerialSwitch::NAME)->update(['enabled' => false]);
            $maskPath = $pending->command[array_search('--mask-out', $pending->command, true) + 1];
            file_put_contents($maskPath, 'png');

            return Process::result(json_encode([
                'image_width' => 800,
                'image_height' => 600,
                'mask_width' => 160,
                'mask_height' => 120,
                'normal_canopy_percent' => 80.0,
                'abnormal_canopy_percent' => 20.0,
                'canopy_coverage_percent' => 70.0,
                'model_sha256' => self::SHA,
                'inference_ms' => 300,
            ]));
        });

        Sanctum::actingAs($owner, ['assignment:complete']);
        $this->postJson("/api/v1/mobile/assignments/{$assignment->uuid}/aerial-analyses", [
            'client_uuid' => (string) Str::uuid(),
            'image' => UploadedFile::fake()->image('drone.jpg', 800, 600),
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'AERIAL_DISABLED');

        $this->assertDatabaseCount('report_aerial_analyses', 0);
        $this->assertSame([], Storage::disk('local')->allFiles('aerial'));
    }
}
