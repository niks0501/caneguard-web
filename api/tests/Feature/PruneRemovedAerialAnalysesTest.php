<?php

namespace Tests\Feature;

use App\Actions\Reports\BuildMobileAerialBrief;
use App\Models\Report;
use App\Models\ReportAerialAnalysis;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class PruneRemovedAerialAnalysesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
        Storage::fake('local');
    }

    private function seedAnalysis(Report $report, User $user, ?Carbon $removedAt): ReportAerialAnalysis
    {
        $uuid = (string) Str::uuid7();
        $imagePath = "aerial/{$uuid}.jpg";
        $maskPath = "aerial/{$uuid}-mask.png";
        Storage::disk('local')->put($imagePath, 'img');
        Storage::disk('local')->put($maskPath, 'mask');
        Storage::disk('local')->put("aerial/{$uuid}-mobile-preview.jpg", 'preview');
        Storage::disk('local')->put("aerial/{$uuid}-mobile-overlay.jpg", 'overlay');

        return ReportAerialAnalysis::query()->create([
            'uuid' => $uuid,
            'report_id' => $report->getKey(),
            'uploaded_by' => $user->getKey(),
            'image_path' => $imagePath,
            'image_mime_type' => 'image/jpeg',
            'image_size_bytes' => 3,
            'image_width' => 400,
            'image_height' => 300,
            'mask_path' => $maskPath,
            'mask_width' => 400,
            'mask_height' => 300,
            'normal_canopy_percent' => 80.0,
            'abnormal_canopy_percent' => 20.0,
            'canopy_coverage_percent' => 70.0,
            'model_version' => 'aerial-v3',
            'weights_sha256' => str_repeat('a', 64),
            'inference_ms' => 200,
            'removed_at' => $removedAt,
            'removed_by' => $removedAt ? $user->getKey() : null,
            'removal_id' => $removedAt ? (string) Str::uuid() : null,
        ]);
    }

    public function test_prunes_expired_removed_files_and_keeps_active_and_recent_removed(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();

        $active = $this->seedAnalysis($report, $reviewer, null);
        $recentRemoved = $this->seedAnalysis($report, $reviewer, now()->subDays(10));
        $expiredRemoved = $this->seedAnalysis($report, $reviewer, now()->subDays(31));

        $this->artisan('caneguard:prune-removed-aerial-analyses')
            ->assertExitCode(0);

        $this->assertDatabaseHas('report_aerial_analyses', ['id' => $active->id]);
        $this->assertDatabaseHas('report_aerial_analyses', ['id' => $recentRemoved->id]);
        $this->assertDatabaseMissing('report_aerial_analyses', ['id' => $expiredRemoved->id]);

        Storage::disk('local')->assertExists($active->image_path);
        Storage::disk('local')->assertExists($active->mask_path);
        Storage::disk('local')->assertExists($recentRemoved->image_path);
        Storage::disk('local')->assertExists($recentRemoved->mask_path);
        Storage::disk('local')->assertMissing($expiredRemoved->image_path);
        Storage::disk('local')->assertMissing($expiredRemoved->mask_path);
        foreach (BuildMobileAerialBrief::derivativePaths($expiredRemoved) as $derivativePath) {
            Storage::disk('local')->assertMissing($derivativePath);
        }
        foreach (BuildMobileAerialBrief::derivativePaths($active) as $derivativePath) {
            Storage::disk('local')->assertExists($derivativePath);
        }

        $audit = SecurityAudit::query()
            ->where('action', SecurityAudit::ACTION_PRUNE_RUN)
            ->latest('id')
            ->first();
        $this->assertNotNull($audit);
        $this->assertSame('caneguard:prune-removed-aerial-analyses', $audit->metadata['command']);
        $this->assertSame(1, $audit->metadata['pruned']);
        $this->assertSame(30, $audit->metadata['days']);
    }
}
