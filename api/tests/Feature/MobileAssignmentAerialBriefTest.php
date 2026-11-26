<?php

namespace Tests\Feature;

use App\Actions\Reports\BuildMobileAerialBrief;
use App\Contracts\MobileFieldValidationAssignmentContract;
use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\ReportAerialAnalysis;
use App\Models\User;
use App\Support\AerialSwitch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileAssignmentAerialBriefTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
        Storage::fake('local');
    }

    private function setAerialFeature(bool $installed, bool $switchedOn): void
    {
        config(['caneguard.aerial.enabled' => $installed]);
        DB::table('feature_switches')->updateOrInsert(
            ['name' => AerialSwitch::NAME],
            ['enabled' => $switchedOn],
        );
    }

    private function createRgbJpeg(int $width, int $height): string
    {
        $image = imagecreatetruecolor($width, $height);
        $green = imagecolorallocate($image, 58, 120, 62);
        imagefilledrectangle($image, 0, 0, $width - 1, $height - 1, $green);
        ob_start();
        imagejpeg($image, null, 90);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }

    private function createClassMaskPng(int $width, int $height): string
    {
        $mask = imagecreatetruecolor($width, $height);
        $class1 = imagecolorallocate($mask, 1, 1, 1);
        $class2 = imagecolorallocate($mask, 2, 2, 2);
        imagefilledrectangle($mask, 0, 0, $width - 1, $height - 1, $class1);
        // Paint left half with class 2 (visibly abnormal canopy).
        imagefilledrectangle($mask, 0, 0, (int) floor($width / 2), $height - 1, $class2);
        ob_start();
        imagepng($mask);
        $bytes = (string) ob_get_clean();
        imagedestroy($mask);

        return $bytes;
    }

    private function seedAerialAnalysis(
        Report $report,
        User $uploader,
        int $width = 2400,
        int $height = 1800,
        float $coverage = 74.5,
        float $abnormal = 22.4,
    ): ReportAerialAnalysis {
        $uuid = (string) Str::uuid7();
        $imagePath = "aerial/{$uuid}.jpg";
        $maskPath = "aerial/{$uuid}-mask.png";
        $jpeg = $this->createRgbJpeg($width, $height);
        $mask = $this->createClassMaskPng(160, 120);

        Storage::disk('local')->put($imagePath, $jpeg);
        Storage::disk('local')->put($maskPath, $mask);

        return ReportAerialAnalysis::query()->create([
            'uuid' => $uuid,
            'report_id' => $report->getKey(),
            'uploaded_by' => $uploader->getKey(),
            'image_path' => $imagePath,
            'image_mime_type' => 'image/jpeg',
            'image_size_bytes' => strlen($jpeg),
            'image_width' => $width,
            'image_height' => $height,
            'mask_path' => $maskPath,
            'mask_width' => 160,
            'mask_height' => 120,
            'normal_canopy_percent' => round(100 - $abnormal, 2),
            'abnormal_canopy_percent' => $abnormal,
            'canopy_coverage_percent' => $coverage,
            'model_version' => 'aerial-v3',
            'weights_sha256' => str_repeat('b', 64),
            'inference_ms' => 420,
        ]);
    }

    /**
     * @return array{reviewer: User, owner: User, report: Report, assignment: FieldValidationAssignment}
     */
    private function seedAssignedCase(): array
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $owner = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $owner->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);

        return compact('reviewer', 'owner', 'report', 'assignment');
    }

    public function test_aerial_brief_is_omitted_and_media_routes_404_when_switch_is_off(): void
    {
        ['reviewer' => $reviewer, 'owner' => $owner, 'report' => $report, 'assignment' => $assignment] = $this->seedAssignedCase();
        $this->seedAerialAnalysis($report, $reviewer);
        $this->setAerialFeature(true, false);

        Sanctum::actingAs($owner, ['assignment:read']);
        $item = $this->getJson('/api/v1/mobile/assignments')->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('aerial_check', $item);
        $this->assertSame(
            array_keys(MobileFieldValidationAssignmentContract::definition()['fields']),
            array_keys($item),
        );

        $this->get("/api/v1/mobile/assignments/{$assignment->uuid}/aerial-preview")->assertNotFound();
        $this->get("/api/v1/mobile/assignments/{$assignment->uuid}/aerial-overlay")->assertNotFound();
    }

    public function test_assigned_inspector_receives_bounded_aerial_brief_and_distinct_preview_and_overlay(): void
    {
        ['reviewer' => $reviewer, 'owner' => $owner, 'report' => $report, 'assignment' => $assignment] = $this->seedAssignedCase();
        $analysis = $this->seedAerialAnalysis($report, $reviewer, 2400, 1800, 74.5, 22.4);
        $this->setAerialFeature(true, true);

        Sanctum::actingAs($owner, ['assignment:read']);
        $response = $this->getJson('/api/v1/mobile/assignments')->assertOk();
        $brief = $response->json('data.0.aerial_check');

        $this->assertIsArray($brief);
        $this->assertSame($analysis->uuid, $brief['uuid']);
        $this->assertTrue($brief['enough_canopy']);
        $this->assertSame(22.4, $brief['abnormal_canopy_percent']);
        $this->assertSame(74.5, $brief['canopy_coverage_percent']);
        $this->assertSame('aerial-v3', $brief['model_version']);
        $this->assertSame("/api/v1/mobile/assignments/{$assignment->uuid}/aerial-preview", $brief['preview']['url']);
        $this->assertSame('image/jpeg', $brief['preview']['content_type']);
        $this->assertGreaterThan(0, $brief['preview']['bytes']);
        $this->assertLessThan(10 * 1024 * 1024, $brief['preview']['bytes']);
        $this->assertSame("/api/v1/mobile/assignments/{$assignment->uuid}/aerial-overlay", $brief['overlay']['url']);
        $this->assertSame('image/jpeg', $brief['overlay']['content_type']);
        $this->assertGreaterThan(0, $brief['overlay']['bytes']);
        $this->assertLessThan(10 * 1024 * 1024, $brief['overlay']['bytes']);

        $previewResponse = $this->get($brief['preview']['url'])
            ->assertOk()
            ->assertHeader('Content-Type', 'image/jpeg')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('private', (string) $previewResponse->headers->get('Cache-Control'));
        $this->assertStringContainsString('no-cache', (string) $previewResponse->headers->get('Cache-Control'));

        $overlayResponse = $this->get($brief['overlay']['url'])
            ->assertOk()
            ->assertHeader('Content-Type', 'image/jpeg')
            ->assertHeader('X-Content-Type-Options', 'nosniff');

        $previewBytes = $previewResponse->streamedContent();
        $overlayBytes = $overlayResponse->streamedContent();
        $previewInfo = getimagesizefromstring($previewBytes);
        $overlayInfo = getimagesizefromstring($overlayBytes);

        $this->assertIsArray($previewInfo);
        $this->assertIsArray($overlayInfo);
        $this->assertSame(BuildMobileAerialBrief::MAX_EDGE_PX, $previewInfo[0]);
        $this->assertSame(1200, $previewInfo[1]);
        $this->assertSame($previewInfo[0], $overlayInfo[0]);
        $this->assertSame($previewInfo[1], $overlayInfo[1]);
        $this->assertNotSame($previewBytes, $overlayBytes);
    }

    public function test_low_canopy_coverage_hides_abnormal_percent_in_mobile_brief(): void
    {
        ['reviewer' => $reviewer, 'owner' => $owner, 'report' => $report] = $this->seedAssignedCase();
        $this->seedAerialAnalysis($report, $reviewer, 800, 600, 4.2, 60.0);
        $this->setAerialFeature(true, true);

        Sanctum::actingAs($owner, ['assignment:read']);
        $brief = $this->getJson('/api/v1/mobile/assignments')->assertOk()->json('data.0.aerial_check');

        $this->assertFalse($brief['enough_canopy']);
        $this->assertNull($brief['abnormal_canopy_percent']);
        $this->assertSame(4.2, $brief['canopy_coverage_percent']);
    }

    public function test_sync_version_invalidates_when_aerial_check_is_added_removed_or_toggled_off(): void
    {
        ['reviewer' => $reviewer, 'owner' => $owner, 'report' => $report] = $this->seedAssignedCase();
        $this->setAerialFeature(true, true);

        Sanctum::actingAs($owner, ['assignment:read']);
        $vBefore = $this->getJson('/api/v1/mobile/assignments')->assertOk()->json('sync.version');

        $analysis = $this->seedAerialAnalysis($report, $reviewer, 640, 480);
        $afterAdd = $this->getJson('/api/v1/mobile/assignments?since='.$vBefore)->assertOk();
        $afterAdd->assertJsonPath('sync.unchanged', false);
        $vWithAerial = $afterAdd->json('sync.version');
        $this->assertNotSame($vBefore, $vWithAerial);

        $this->getJson('/api/v1/mobile/assignments?since='.$vWithAerial)
            ->assertOk()
            ->assertJsonPath('sync.unchanged', true);

        $analysis->update([
            'removed_at' => now(),
            'removed_by' => $reviewer->getKey(),
            'removal_id' => (string) Str::uuid(),
        ]);
        $afterRemove = $this->getJson('/api/v1/mobile/assignments?since='.$vWithAerial)->assertOk();
        $afterRemove->assertJsonPath('sync.unchanged', false);
        $this->assertArrayNotHasKey('aerial_check', $afterRemove->json('data.0'));
        $this->assertSame($vBefore, $afterRemove->json('sync.version'));
    }

    public function test_aerial_media_routes_enforce_assignment_ownership_role_ability_and_removal(): void
    {
        ['reviewer' => $reviewer, 'owner' => $owner, 'report' => $report, 'assignment' => $assignment] = $this->seedAssignedCase();
        $otherInspector = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $farmer = User::factory()->inDistrict($this->pilotDistrict())->farmer()->create();
        $analysis = $this->seedAerialAnalysis($report, $reviewer, 640, 480);
        $this->setAerialFeature(true, true);

        $previewUrl = "/api/v1/mobile/assignments/{$assignment->uuid}/aerial-preview";
        $overlayUrl = "/api/v1/mobile/assignments/{$assignment->uuid}/aerial-overlay";

        Sanctum::actingAs($otherInspector, ['assignment:read']);
        $this->get($previewUrl)->assertForbidden();
        $this->get($overlayUrl)->assertForbidden();

        Sanctum::actingAs($reviewer, ['assignment:read']);
        $this->get($previewUrl)->assertForbidden();

        Sanctum::actingAs($farmer, ['assignment:read']);
        $this->get($previewUrl)->assertForbidden();

        Sanctum::actingAs($owner, ['report:status']);
        $this->get($previewUrl)->assertForbidden();

        // Owner can download while assigned, and loses access immediately on reassignment.
        Sanctum::actingAs($owner, ['assignment:read']);
        $this->get($previewUrl)->assertOk();
        $assignment->update(['assignee_id' => $otherInspector->getKey()]);
        $this->get($previewUrl)->assertForbidden();

        // New assignee sees 404 once the aerial analysis is soft-removed.
        $analysis->update([
            'removed_at' => now(),
            'removed_by' => $reviewer->getKey(),
            'removal_id' => (string) Str::uuid(),
        ]);
        Sanctum::actingAs($otherInspector, ['assignment:read']);
        $this->get($previewUrl)->assertNotFound();
        $this->get($overlayUrl)->assertNotFound();
    }
}
