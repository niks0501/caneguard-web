<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\ReportAerialAnalysis;
use App\Models\User;
use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Proposal tests: the flag-off contract, access, validation and persistence of
 * the experimental aerial check. Python is faked; no model runs here.
 */
class ReportAerialAnalysisTest extends TestCase
{
    use RefreshDatabase;

    private const SHA = 'bf086c5ea11ecf83bbbbef6df1b515ba341fde2b0d90d23e87728268fcde2bf4';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
        Storage::fake('local');
    }

    private function enable(): void
    {
        config([
            'caneguard.aerial.enabled' => true,
            'caneguard.aerial.model_path' => '/srv/aerial/model.onnx',
            'caneguard.aerial.weights_sha256' => self::SHA,
        ]);
    }

    /** @param array<string, mixed> $override */
    private function fakeSegmenter(array $override = []): void
    {
        Process::fake(function (PendingProcess $pending) use ($override): ProcessResult {
            $mask = $pending->command[array_search('--mask-out', $pending->command, true) + 1];
            file_put_contents($mask, 'png');

            return Process::result(json_encode([...[
                'image_width' => 400,
                'image_height' => 300,
                'mask_width' => 400,
                'mask_height' => 300,
                'normal_canopy_percent' => 82.0,
                'abnormal_canopy_percent' => 18.0,
                'canopy_coverage_percent' => 71.0,
                'model_sha256' => self::SHA,
                'inference_ms' => 480,
            ], ...$override]));
        });
    }

    private function photo(string $name = 'field.jpg'): UploadedFile
    {
        return UploadedFile::fake()->image($name, 400, 300);
    }

    public function test_flag_off_routes_404_and_the_case_has_no_aerial_key(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        $this->actingAs($reviewer, 'web');

        $this->postJson("/api/v1/reports/{$report->uuid}/aerial-analyses", ['image' => $this->photo()])->assertNotFound();
        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonMissingPath('data.aerial_analyses');
        $this->assertDatabaseCount('report_aerial_analyses', 0);
    }

    public function test_flag_on_case_response_lists_active_analyses_only(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        $this->actingAs($reviewer, 'web');

        $this->getJson("/api/v1/reports/{$report->uuid}")->assertOk()->assertJsonPath('data.aerial_analyses', []);

        $uuid = $this->postJson("/api/v1/reports/{$report->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->assertCreated()
            ->assertJsonPath('data.normal_canopy_percent', 82)
            ->assertJsonPath('data.abnormal_canopy_percent', 18)
            ->assertJsonPath('data.canopy_coverage_percent', 71)
            ->assertJsonPath('data.model_version', 'aerial-v3')
            ->assertJsonPath('data.uploaded_by.uuid', $reviewer->uuid)
            ->json('data.uuid');

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonCount(1, 'data.aerial_analyses')
            ->assertJsonPath('data.aerial_analyses.0.uuid', $uuid);
    }

    public function test_success_stores_row_and_both_files_and_streams_them(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create(['affected_portion_percent' => 33, 'affected_area_hectares' => 2.5]);
        $this->actingAs($reviewer, 'web');

        $uuid = $this->postJson("/api/v1/reports/{$report->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->assertCreated()->json('data.uuid');

        $row = ReportAerialAnalysis::query()->where('uuid', $uuid)->firstOrFail();
        Storage::disk('local')->assertExists($row->image_path);
        Storage::disk('local')->assertExists($row->mask_path);
        $this->assertSame(self::SHA, $row->weights_sha256);
        $this->get("/api/v1/reports/{$report->uuid}/aerial-analyses/{$uuid}/image")->assertOk();
        $this->get("/api/v1/reports/{$report->uuid}/aerial-analyses/{$uuid}/mask")
            ->assertOk()->assertHeader('Content-Type', 'image/png');

        $report->refresh();
        $this->assertSame(33.0, (float) $report->affected_portion_percent);
        $this->assertSame(2.5, (float) $report->affected_area_hectares);
    }

    public function test_shares_are_hidden_below_the_coverage_floor(): void
    {
        $this->enable();
        $this->fakeSegmenter(['canopy_coverage_percent' => 4.0]);
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();

        $this->actingAs($reviewer, 'web')
            ->postJson("/api/v1/reports/{$report->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->assertCreated()
            ->assertJsonPath('data.enough_canopy', false)
            ->assertJsonPath('data.normal_canopy_percent', null)
            ->assertJsonPath('data.abnormal_canopy_percent', null)
            ->assertJsonPath('data.canopy_coverage_percent', 4);
    }

    public function test_field_reporter_and_mobile_token_are_refused(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $report = Report::factory()->create();
        $url = "/api/v1/reports/{$report->uuid}/aerial-analyses";

        $this->actingAs(User::factory()->fieldReporter()->create(), 'web')
            ->postJson($url, ['image' => $this->photo()])->assertForbidden();

        Sanctum::actingAs(User::factory()->fieldReporter()->create(), ['*']);
        $this->postJson($url, ['image' => $this->photo()])->assertForbidden();
        $this->assertDatabaseCount('report_aerial_analyses', 0);
    }

    public function test_bad_files_are_rejected_with_422(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        $url = "/api/v1/reports/{$report->uuid}/aerial-analyses";
        $this->actingAs($reviewer, 'web');

        $this->postJson($url, [])->assertUnprocessable();
        $this->postJson($url, ['image' => UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf')])->assertUnprocessable();
        $this->postJson($url, ['image' => UploadedFile::fake()->image('big.jpg', 400, 300)->size(20481)])->assertUnprocessable();
        $this->postJson($url, ['image' => UploadedFile::fake()->image('wide.jpg', 10001, 10)])->assertUnprocessable();
        Process::assertNothingRan();
    }

    public function test_runner_failure_returns_503_and_leaves_nothing(): void
    {
        $this->enable();
        Process::fake(fn () => Process::result('', 'boom', 1));
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();

        $this->actingAs($reviewer, 'web')
            ->postJson("/api/v1/reports/{$report->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->assertStatus(503);

        $this->assertDatabaseCount('report_aerial_analyses', 0);
        $this->assertSame([], Storage::disk('local')->allFiles('aerial'));
    }

    public function test_malformed_or_unpinned_output_returns_503_and_deletes_files(): void
    {
        $this->enable();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        $url = "/api/v1/reports/{$report->uuid}/aerial-analyses";
        $this->actingAs($reviewer, 'web');

        foreach ([
            ['normal_canopy_percent' => 150.0],
            ['abnormal_canopy_percent' => 30.0],
            ['model_sha256' => str_repeat('a', 64)],
        ] as $bad) {
            $this->fakeSegmenter($bad);
            $this->postJson($url, ['image' => $this->photo()])->assertStatus(503);
        }
        Process::fake(fn () => Process::result('not json'));
        $this->postJson($url, ['image' => $this->photo()])->assertStatus(503);

        $this->assertDatabaseCount('report_aerial_analyses', 0);
        $this->assertSame([], Storage::disk('local')->allFiles('aerial'));
    }

    public function test_a_second_check_while_one_runs_gets_429(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        $held = Cache::lock('aerial-analysis', 60);
        $this->assertTrue($held->get());

        $this->actingAs($reviewer, 'web')
            ->postJson("/api/v1/reports/{$report->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->assertStatus(429);
        Process::assertNothingRan();
        $held->release();
    }

    public function test_remove_hides_the_row_but_keeps_the_files(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        $this->actingAs($reviewer, 'web');
        $uuid = $this->postJson("/api/v1/reports/{$report->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->json('data.uuid');
        $row = ReportAerialAnalysis::query()->where('uuid', $uuid)->firstOrFail();

        $removal = $this->deleteJson("/api/v1/reports/{$report->uuid}/aerial-analyses/{$uuid}")
            ->assertOk()
            ->assertJsonStructure(['data' => ['removal_id']])
            ->json('data.removal_id');

        $this->getJson("/api/v1/reports/{$report->uuid}")->assertJsonCount(0, 'data.aerial_analyses');
        $this->get("/api/v1/reports/{$report->uuid}/aerial-analyses/{$uuid}/image")->assertNotFound();
        Storage::disk('local')->assertExists($row->image_path);
        Storage::disk('local')->assertExists($row->mask_path);
        $this->assertSame($removal, ReportAerialAnalysis::query()->where('uuid', $uuid)->value('removal_id'));
        $this->assertNotNull($row->fresh()->removed_at);
        $this->assertSame($reviewer->id, $row->fresh()->removed_by);
    }

    public function test_a_second_removal_keeps_the_existing_removal_identity(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        $this->actingAs($reviewer, 'web');
        $uuid = $this->postJson("/api/v1/reports/{$report->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->json('data.uuid');
        $delete = "/api/v1/reports/{$report->uuid}/aerial-analyses/{$uuid}";
        $firstRemoval = $this->deleteJson($delete)->json('data.removal_id');

        $this->deleteJson($delete)->assertNotFound();

        $row = ReportAerialAnalysis::query()->where('uuid', $uuid)->firstOrFail();
        $this->assertSame($firstRemoval, $row->removal_id);
        $this->assertNotNull($row->removed_at);
    }

    public function test_restore_undoes_a_removal_and_is_idempotent(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        $this->actingAs($reviewer, 'web');
        $uuid = $this->postJson("/api/v1/reports/{$report->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->json('data.uuid');
        $removalId = $this->deleteJson("/api/v1/reports/{$report->uuid}/aerial-analyses/{$uuid}")
            ->json('data.removal_id');
        $restore = "/api/v1/reports/{$report->uuid}/aerial-analyses/{$uuid}/restore";

        $this->postJson($restore, ['removal_id' => $removalId])->assertOk()->assertJsonPath('data.uuid', $uuid);
        $this->postJson($restore, ['removal_id' => $removalId])->assertOk()->assertJsonPath('data.uuid', $uuid);

        $row = ReportAerialAnalysis::query()->where('uuid', $uuid)->firstOrFail();
        $this->assertNull($row->removed_at);
        $this->assertNull($row->removed_by);
        $this->assertSame($removalId, $row->removal_id);
        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertJsonCount(1, 'data.aerial_analyses')
            ->assertJsonPath('data.aerial_analyses.0.uuid', $uuid);
        $this->get("/api/v1/reports/{$report->uuid}/aerial-analyses/{$uuid}/image")->assertOk();
    }

    public function test_restore_refuses_a_stale_or_missing_removal_identity(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();
        $this->actingAs($reviewer, 'web');
        $uuid = $this->postJson("/api/v1/reports/{$report->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->json('data.uuid');
        $delete = "/api/v1/reports/{$report->uuid}/aerial-analyses/{$uuid}";
        $restore = "{$delete}/restore";
        $firstRemoval = $this->deleteJson($delete)->json('data.removal_id');
        $staleRemoval = (string) Str::uuid();

        $this->postJson($restore)->assertStatus(422);
        $this->postJson($restore, ['removal_id' => 'not-a-uuid'])->assertStatus(422);
        $this->postJson($restore, ['removal_id' => $staleRemoval])->assertStatus(409);
        $this->assertNotNull(ReportAerialAnalysis::query()->where('uuid', $uuid)->value('removed_at'));

        $this->postJson($restore, ['removal_id' => $firstRemoval])->assertOk();
        $secondRemoval = $this->deleteJson($delete)->json('data.removal_id');
        $this->assertNotSame($firstRemoval, $secondRemoval);

        $this->postJson($restore, ['removal_id' => $firstRemoval])->assertStatus(409);

        $row = ReportAerialAnalysis::query()->where('uuid', $uuid)->firstOrFail();
        $this->assertNotNull($row->removed_at);
        $this->assertSame($secondRemoval, $row->removal_id);
    }

    public function test_restore_is_refused_across_reports_roles_and_flag_off(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $reviewer = User::factory()->reviewer()->create();
        [$one, $two] = [Report::factory()->create(), Report::factory()->create()];
        $this->actingAs($reviewer, 'web');
        $uuid = $this->postJson("/api/v1/reports/{$one->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->json('data.uuid');
        $removalId = $this->deleteJson("/api/v1/reports/{$one->uuid}/aerial-analyses/{$uuid}")
            ->json('data.removal_id');
        $restore = "/api/v1/reports/{$one->uuid}/aerial-analyses/{$uuid}/restore";

        $this->postJson("/api/v1/reports/{$two->uuid}/aerial-analyses/{$uuid}/restore", ['removal_id' => $removalId])
            ->assertNotFound();
        $this->postJson("/api/v1/reports/{$one->uuid}/aerial-analyses/unknown/restore", ['removal_id' => $removalId])
            ->assertNotFound();

        config(['caneguard.aerial.enabled' => false]);
        $this->postJson($restore, ['removal_id' => $removalId])->assertNotFound();
        $this->enable();

        Auth::forgetGuards();
        $this->flushSession();
        $this->actingAs(User::factory()->fieldReporter()->create(), 'web')
            ->postJson($restore, ['removal_id' => $removalId])->assertForbidden();
        Auth::forgetGuards();
        $this->flushSession();
        Sanctum::actingAs(User::factory()->fieldReporter()->create(), ['*']);
        $this->postJson($restore, ['removal_id' => $removalId])->assertForbidden();

        $this->assertNotNull(ReportAerialAnalysis::query()->where('uuid', $uuid)->value('removed_at'));
    }

    public function test_an_analysis_cannot_be_read_through_another_report(): void
    {
        $this->enable();
        $this->fakeSegmenter();
        $reviewer = User::factory()->reviewer()->create();
        [$one, $two] = [Report::factory()->create(), Report::factory()->create()];
        $this->actingAs($reviewer, 'web');
        $uuid = $this->postJson("/api/v1/reports/{$one->uuid}/aerial-analyses", ['image' => $this->photo()])
            ->json('data.uuid');

        $this->get("/api/v1/reports/{$two->uuid}/aerial-analyses/{$uuid}/image")->assertNotFound();
    }
}
