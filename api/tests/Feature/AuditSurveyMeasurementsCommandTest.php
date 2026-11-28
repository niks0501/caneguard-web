<?php

namespace Tests\Feature;

use App\Http\Resources\ReportAffectedFieldResource;
use App\Models\District;
use App\Models\FieldSurvey;
use App\Models\FieldSurveyAudit;
use App\Models\Report;
use App\Models\ReportAudit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuditSurveyMeasurementsCommandTest extends TestCase
{
    use RefreshDatabase;

    private District $district;

    private User $inspector;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
        $this->district = $this->pilotDistrict();
        $this->inspector = User::factory()->inDistrict($this->district)->fieldReporter()->create();
    }

    public function test_it_classifies_every_bucket_deterministically(): void
    {
        $fixture = $this->seedFixture();

        $first = $this->audit();
        $second = $this->audit();

        $this->assertSame($first, $second, 'the audit is deterministic');
        $this->assertTrue($first['read_only']);
        $this->assertSame(['A', 'B', 'C', 'D', 'E'], array_keys($first['buckets']));

        // A: plot-only surveys that stored a forced 0. A confirmed zero is not one.
        $this->assertSame(1, $first['buckets']['A']['count']);
        $this->assertSame([$fixture['plotOnly']->id], $first['buckets']['A']['ids']);

        // B: plot area mapped as affected, by client uuid and by office link.
        $this->assertSame(
            [$fixture['mappedByUuid']->id, $fixture['mappedByLink']->id],
            $first['buckets']['B']['ids'],
        );
        $this->assertSame([$fixture['plotOnly']->id, $fixture['plotOnly']->id], array_column($first['buckets']['B']['items'], 'field_survey_id'));

        // C: provenance desync in either direction, on any of the three pairs.
        $this->assertSame([$fixture['flagNotMeasured']->id, $fixture['flagMeasuredEmpty']->id], $first['buckets']['C']['ids']);
        $this->assertSame([['affected_area_measurement'], ['plot_area_measurement']], array_column($first['buckets']['C']['items'], 'fields'));

        // D: a real 40 m2 patch rounded to 0.
        $this->assertSame([$fixture['tiny']->id], $first['buckets']['D']['ids']);

        // E: only the sealed weeks that contain a B, C or D report, listed and never changed.
        $this->assertSame(2, $first['buckets']['E']['count']);
        $this->assertSame([$fixture['weekly']], $first['buckets']['E']['ids']['district_report_versions']);
        $this->assertSame([$fixture['rssi']], $first['buckets']['E']['ids']['district_rssi_report_versions']);
        $this->assertNotContains($fixture['otherWeek'], $first['buckets']['E']['ids']['district_report_versions']);

        // Clean reports and surveys appear nowhere.
        $flagged = array_merge(
            $first['buckets']['B']['ids'],
            $first['buckets']['C']['ids'],
            $first['buckets']['D']['ids'],
        );
        $this->assertNotContains($fixture['clean']->id, $flagged);
    }

    public function test_it_writes_nothing(): void
    {
        $this->seedFixture();
        $before = $this->checksums();
        $writes = [];
        DB::listen(function ($query) use (&$writes): void {
            if (! str_starts_with(strtolower(ltrim($query->sql)), 'select')) {
                $writes[] = $query->sql;
            }
        });

        Artisan::call('caneguard:audit-survey-measurements', ['--json' => true]);
        Artisan::call('caneguard:audit-survey-measurements');

        $this->assertSame([], $writes);
        $this->assertSame($before, $this->checksums());
    }

    public function test_the_table_output_names_each_bucket_and_never_alters_data(): void
    {
        $this->seedFixture();

        $this->artisan('caneguard:audit-survey-measurements')
            ->expectsOutputToContain('Unmeasured survey stored as 0')
            ->expectsOutputToContain('Plot area mapped as affected area')
            ->expectsOutputToContain('nothing was changed')
            ->assertSuccessful();
    }

    public function test_an_empty_database_reports_zero_in_every_bucket(): void
    {
        $audit = $this->audit();

        foreach ($audit['buckets'] as $bucket) {
            $this->assertSame(0, $bucket['count']);
        }
    }

    // ------------------------------------------------------------------
    // PR 4: dry run plans, --apply remediates buckets A-D with audit rows.
    // ------------------------------------------------------------------

    public function test_a_dry_run_shows_each_planned_change_and_writes_nothing(): void
    {
        $fixture = $this->seedProductionShape();
        $before = $this->checksums();
        $writes = [];
        DB::listen(function ($query) use (&$writes): void {
            if (! str_starts_with(strtolower(ltrim($query->sql)), 'select')) {
                $writes[] = $query->sql;
            }
        });

        $audit = $this->audit();
        $this->artisan('caneguard:audit-survey-measurements')
            ->expectsOutputToContain('Planned changes if applied')
            ->expectsOutputToContain('affected_area_sqm 0 -> null')
            ->expectsOutputToContain('plot_area_hectares null -> 1.2; plot_area_measurement not_measured -> measured; affected_area_hectares 1.2 -> 0.3')
            ->expectsOutputToContain('week 2026-W40')
            ->expectsOutputToContain('nothing was changed')
            ->assertSuccessful();
        Artisan::call('caneguard:audit-survey-measurements', ['--buckets' => 'A,B']);

        $this->assertSame([], $writes);
        $this->assertSame($before, $this->checksums(), 'a dry run changes no row in any table');
        $this->assertTrue($audit['read_only']);
        $this->assertSame(['A', 'B', 'C', 'D', 'E'], array_keys($audit['planned_changes']));
        $this->assertCount(3, $audit['planned_changes']['A']);
        $this->assertCount(4, $audit['planned_changes']['B']);

        $real = collect($audit['planned_changes']['B'])->firstWhere('report_id', $fixture['realReport']->id);
        $this->assertSame($fixture['real']->id, $real['field_survey_id']);
        $this->assertSame(['old' => null, 'new' => 1.2], $real['changes']['plot_area_hectares']);
        $this->assertSame(['old' => 1.2, 'new' => 0.3], $real['changes']['affected_area_hectares']);
        $this->assertEquals(['old' => 100, 'new' => 25], $real['changes']['affected_portion_percent']);
    }

    public function test_applying_bucket_a_clears_the_forced_zero_and_records_why(): void
    {
        $fixture = $this->seedProductionShape();
        $confirmedZero = $this->survey(12000, ['affected_area_polygons' => [], 'affected_area_sqm' => 0, 'affected_area_measurement' => 'measured']);

        $result = $this->apply(['--buckets' => 'A']);

        $this->assertSame(0, $result['exit']);
        foreach ($fixture['aSurveys'] as $index => $survey) {
            $row = $survey->fresh();
            $this->assertNull($row->affected_area_sqm);
            $this->assertSame('not_measured', $row->affected_area_measurement);
            $this->assertSame([], $row->affected_area_polygons, 'the polygons are never touched');
            $this->assertSame(13000.0 + 1000 * $index, (float) $row->area_sqm, 'the plot area is never touched');
        }
        $this->assertSame('0.0000', $confirmedZero->fresh()->affected_area_sqm, 'a confirmed zero is not bucket A');
        $this->assertSame('measured', $confirmedZero->fresh()->affected_area_measurement);

        $audits = FieldSurveyAudit::query()->where('field_survey_id', $fixture['aSurveys'][0]->id)->orderBy('id')->get();
        $this->assertSame(['affected_area_sqm', 'affected_area_measurement'], $audits->pluck('field')->all());
        $this->assertEquals(0.0, $audits[0]->original_value);
        $this->assertNull($audits[0]->corrected_value);
        $this->assertNull($audits[1]->original_value);
        $this->assertSame('not_measured', $audits[1]->corrected_value);
        $this->assertSame($this->inspector->id, $audits[0]->actor_id);
        $this->assertSame('survey_measurement_mapping_remediation (bucket A)', $audits[0]->reason);
        $this->assertSame(6, FieldSurveyAudit::query()->count());
        $this->assertSame(0, ReportAudit::query()->count(), 'buckets B, C and D were not selected');
    }

    public function test_applying_bucket_b_separates_plot_and_affected_area(): void
    {
        $fixture = $this->seedProductionShape();

        $this->apply();

        // The report with a real 0.3 ha polygon keeps that, and gets the plot and the share.
        $real = $fixture['realReport']->fresh();
        $this->assertSame('1.2000', $real->plot_area_hectares);
        $this->assertSame('measured', $real->plot_area_measurement);
        $this->assertSame('0.3000', $real->affected_area_hectares);
        $this->assertSame('measured', $real->affected_area_measurement);
        $this->assertSame('25.00', $real->affected_portion_percent);
        $this->assertSame('measured', $real->affected_portion_measurement);
        $this->assertSame(
            (float) $real->affected_portion_percent,
            ReportAffectedFieldResource::affectedPercent($fixture['real']->fresh()),
            'the share follows the same rule the resources use',
        );

        // Reports linked to a plot-only survey never get the plot as their affected figure.
        foreach ($fixture['aReports'] as $index => $report) {
            $row = $report->fresh();
            $this->assertSame(number_format(1.3 + $index / 10, 4, '.', ''), $row->plot_area_hectares);
            $this->assertSame('measured', $row->plot_area_measurement);
            $this->assertNull($row->affected_area_hectares);
            $this->assertSame('not_measured', $row->affected_area_measurement);
            $this->assertNull($row->affected_portion_percent);
            $this->assertSame('not_measured', $row->affected_portion_measurement);
        }

        $audits = ReportAudit::query()->where('report_id', $fixture['realReport']->id)->orderBy('id')->get()->keyBy('field');
        $this->assertSame(['plot_area_hectares', 'plot_area_measurement', 'affected_area_hectares', 'affected_portion_percent'], $audits->keys()->all());
        $this->assertNull($audits['plot_area_hectares']->original_value);
        $this->assertEquals(1.2, $audits['plot_area_hectares']->corrected_value);
        $this->assertEquals(1.2, $audits['affected_area_hectares']->original_value);
        $this->assertEquals(0.3, $audits['affected_area_hectares']->corrected_value);
        $this->assertEquals(100, $audits['affected_portion_percent']->original_value);
        $this->assertEquals(25, $audits['affected_portion_percent']->corrected_value);
        $this->assertSame('survey_measurement_mapping_remediation (bucket B)', $audits['plot_area_hectares']->reason);
        $this->assertSame($this->inspector->id, $audits['plot_area_hectares']->actor_id);
        $this->assertSame('measured', $audits['plot_area_measurement']->corrected_value);

        $plotOnly = ReportAudit::query()->where('report_id', $fixture['aReports'][0]->id)->orderBy('id')->get()->keyBy('field');
        $this->assertEquals(1.3, $plotOnly['affected_area_hectares']->original_value);
        $this->assertNull($plotOnly['affected_area_hectares']->corrected_value);
        $this->assertSame('not_measured', $plotOnly['affected_area_measurement']->corrected_value);
        $this->assertNull($plotOnly['affected_portion_percent']->corrected_value);
    }

    public function test_a_confirmed_zero_survey_gives_a_measured_zero_not_not_measured(): void
    {
        $confirmedZero = $this->survey(12000, ['affected_area_polygons' => [], 'affected_area_sqm' => 0, 'affected_area_measurement' => 'measured']);
        $report = $this->report('2026-09-29 10:00:00', ['affected_area_hectares' => 1.2, 'field_survey_client_uuid' => $confirmedZero->client_uuid]);

        $this->apply();

        $row = $report->fresh();
        $this->assertSame('0.0000', $row->affected_area_hectares);
        $this->assertSame('measured', $row->affected_area_measurement);
        $this->assertSame('0.00', $row->affected_portion_percent);
        $this->assertSame('measured', $row->affected_portion_measurement);
    }

    public function test_a_real_patch_close_to_the_plot_size_is_corrected_once_and_then_stays_clean(): void
    {
        $polygon = ['type' => 'Polygon', 'coordinates' => [[[122.95, 10.7], [122.9502, 10.7], [122.95, 10.7002], [122.95, 10.7]]]];
        $nearPlot = $this->survey(12000, ['affected_area_polygons' => [$polygon], 'affected_area_sqm' => 11900, 'affected_area_measurement' => 'measured']);
        $report = $this->report('2026-09-29 10:00:00', ['affected_area_hectares' => 1.2, 'field_survey_client_uuid' => $nearPlot->client_uuid]);

        $this->assertSame([$report->id], $this->audit()['buckets']['B']['ids']);

        $this->apply();

        $row = $report->fresh();
        $this->assertSame('1.1900', $row->affected_area_hectares);
        $this->assertSame('99.20', $row->affected_portion_percent);
        $this->assertSame(0, $this->audit()['buckets']['B']['count'], 'the fixed report no longer reads as plot-as-affected');
    }

    public function test_applying_bucket_c_changes_only_the_flag(): void
    {
        $fixture = $this->seedFixture();

        $this->apply(['--buckets' => 'C']);

        $notMeasured = $fixture['flagNotMeasured']->fresh();
        $this->assertSame('2.0000', $notMeasured->affected_area_hectares, 'the value is never changed');
        $this->assertSame('measured', $notMeasured->affected_area_measurement);
        $emptyButMeasured = $fixture['flagMeasuredEmpty']->fresh();
        $this->assertNull($emptyButMeasured->plot_area_hectares);
        $this->assertSame('not_measured', $emptyButMeasured->plot_area_measurement);

        $audit = ReportAudit::query()->where('report_id', $fixture['flagNotMeasured']->id)->sole();
        $this->assertSame('affected_area_measurement', $audit->field);
        $this->assertSame('not_measured', $audit->original_value);
        $this->assertSame('measured', $audit->corrected_value);
        $this->assertSame('survey_measurement_mapping_remediation (bucket C)', $audit->reason);
        $this->assertSame(2, ReportAudit::query()->count(), 'bucket B and D reports were not touched');
        $this->assertSame('0.0000', $fixture['tiny']->fresh()->affected_area_hectares);
    }

    public function test_applying_bucket_d_restores_the_tiny_patch(): void
    {
        $fixture = $this->seedFixture();

        $this->apply(['--buckets' => 'D']);

        $row = $fixture['tiny']->fresh();
        $this->assertSame('0.0040', $row->affected_area_hectares);
        $this->assertSame('measured', $row->affected_area_measurement);
        $audit = ReportAudit::query()->where('report_id', $fixture['tiny']->id)->sole();
        $this->assertSame('affected_area_hectares', $audit->field);
        $this->assertEquals(0, $audit->original_value);
        $this->assertEquals(0.004, $audit->corrected_value);
        $this->assertSame('survey_measurement_mapping_remediation (bucket D)', $audit->reason);
        $this->assertSame(1, ReportAudit::query()->count());
        $this->assertSame(0, FieldSurveyAudit::query()->count());
    }

    public function test_a_second_run_does_nothing_and_writes_no_audit_rows(): void
    {
        $this->seedFixture();
        $this->seedProductionShape();

        $first = $this->apply();
        $afterFirst = $this->checksums();
        $audits = ReportAudit::query()->count() + FieldSurveyAudit::query()->count();
        $this->assertGreaterThan(0, $audits);

        $writes = [];
        DB::listen(function ($query) use (&$writes): void {
            if (! str_starts_with(strtolower(ltrim($query->sql)), 'select')) {
                $writes[] = $query->sql;
            }
        });
        $second = $this->apply();

        $this->assertSame(0, $first['exit']);
        $this->assertSame(0, $second['exit']);
        $this->assertSame([], $writes);
        $this->assertSame($afterFirst, $this->checksums());
        $this->assertSame($audits, ReportAudit::query()->count() + FieldSurveyAudit::query()->count());
        $this->assertSame([], $second['json']['applied']['surveys']);
        $this->assertSame([], $second['json']['applied']['reports']);
    }

    public function test_buckets_filter_what_is_planned_and_applied(): void
    {
        $fixture = $this->seedFixture();

        $planned = $this->audit(['--buckets' => 'A,D']);
        $this->assertCount(1, $planned['planned_changes']['A']);
        $this->assertCount(1, $planned['planned_changes']['D']);
        $this->assertSame([], $planned['planned_changes']['B']);
        $this->assertSame([], $planned['planned_changes']['C']);

        $result = $this->apply(['--buckets' => 'D']);

        $this->assertSame(0, $result['exit']);
        $this->assertSame('0.0040', $fixture['tiny']->fresh()->affected_area_hectares);
        $this->assertNull($fixture['plotOnly']->fresh()->affected_area_measurement, 'bucket A was not selected');
        $this->assertSame('0.0000', $fixture['plotOnly']->fresh()->affected_area_sqm);
        $this->assertSame('1.2000', $fixture['mappedByUuid']->fresh()->affected_area_hectares, 'bucket B was not selected');
        $this->assertSame([], $result['json']['remaining'], 'only the selected buckets are re-audited');
    }

    public function test_invalid_bucket_selections_are_refused_without_writes(): void
    {
        $this->seedFixture();
        $before = $this->checksums();

        foreach (['E', 'A,E', 'X', 'ab'] as $selection) {
            $this->artisan('caneguard:audit-survey-measurements', ['--buckets' => $selection, '--apply' => true, '--actor' => $this->inspector->id])
                ->assertFailed();
            $this->artisan('caneguard:audit-survey-measurements', ['--buckets' => $selection])->assertFailed();
        }

        $this->assertSame($before, $this->checksums());
    }

    public function test_sealed_versions_are_left_byte_identical_and_their_weeks_are_reported(): void
    {
        $fixture = $this->seedFixture();
        $versions = fn (): array => [
            DB::table('district_report_versions')->orderBy('id')->get()->all(),
            DB::table('district_rssi_report_versions')->orderBy('id')->get()->all(),
        ];
        $before = json_encode($versions(), JSON_THROW_ON_ERROR);

        $dry = $this->audit();
        $result = $this->apply();

        $this->assertSame($before, json_encode($versions(), JSON_THROW_ON_ERROR));

        $weeks = collect($dry['planned_changes']['E']);
        $this->assertCount(2, $weeks);
        $weekly = $weeks->firstWhere('version_id', $fixture['weekly']);
        $this->assertSame('2026-W40', $weekly['week']);
        $this->assertSame('2026-09-28', $weekly['week_start']);
        $this->assertFalse($weekly['sealed_version_changed']);
        // B: 1.2 + 1.205 become not measured. C: 2 was excluded, now counted. D: 0 becomes 0.004.
        $this->assertSame(2.405, $weekly['affected_hectares_before']);
        $this->assertSame(2.004, $weekly['affected_hectares_after']);
        $this->assertSame(-0.401, $weekly['affected_hectares_change']);
        // The report from an unrelated week is not part of any sealed week.
        $this->assertNotContains($fixture['otherWeek'], array_column($dry['planned_changes']['E'], 'version_id'));
        $this->assertSame(0, $result['exit']);
    }

    public function test_the_re_audit_finds_nothing_left_in_the_remediated_buckets(): void
    {
        $this->seedFixture();
        $this->seedProductionShape();

        $result = $this->apply();
        $audit = $this->audit();

        $this->assertSame(0, $result['exit']);
        $this->assertSame([], $result['json']['remaining']);
        $this->assertFalse($result['json']['read_only']);
        foreach (['A', 'B', 'C', 'D', 'E'] as $bucket) {
            $this->assertSame(0, $audit['buckets'][$bucket]['count'], "bucket {$bucket} is clean");
        }
    }

    public function test_an_apply_needs_an_actor_that_exists(): void
    {
        $this->seedFixture();
        $before = $this->checksums();

        $this->artisan('caneguard:audit-survey-measurements', ['--apply' => true])
            ->expectsOutputToContain('needs --actor')
            ->assertFailed();
        $this->artisan('caneguard:audit-survey-measurements', ['--apply' => true, '--actor' => '999999'])
            ->expectsOutputToContain('does not match a user')
            ->assertFailed();
        $this->artisan('caneguard:audit-survey-measurements', ['--apply' => true, '--actor' => $this->inspector->email])
            ->expectsOutputToContain('Applying as user #'.$this->inspector->id)
            ->assertSuccessful();

        $this->assertNotSame($before, $this->checksums(), 'an actor given by email is accepted');
    }

    public function test_production_needs_force_or_a_confirmation_to_apply(): void
    {
        $this->seedFixture();
        $this->app->detectEnvironment(fn (): string => 'production');
        $before = $this->checksums();

        // A dry run never asks.
        $this->artisan('caneguard:audit-survey-measurements')->assertSuccessful();

        // Without --force the production prompt is the only way in; an unattended run is cancelled.
        $exit = Artisan::call('caneguard:audit-survey-measurements', ['--apply' => true, '--actor' => $this->inspector->id, '--no-interaction' => true]);
        $this->assertSame(1, $exit);
        $this->assertStringContainsString('Command cancelled', Artisan::output());
        $this->assertSame($before, $this->checksums(), 'an unconfirmed apply writes nothing');

        $this->artisan('caneguard:audit-survey-measurements', ['--apply' => true, '--actor' => $this->inspector->id, '--force' => true])
            ->assertSuccessful();
        $this->assertNotSame($before, $this->checksums());
        $this->assertSame(0, $this->audit()['buckets']['B']['count']);
    }

    public function test_a_survey_that_contradicts_itself_is_reported_and_never_guessed(): void
    {
        $broken = $this->survey(12000, ['affected_area_polygons' => [], 'affected_area_sqm' => null, 'affected_area_measurement' => 'measured']);
        $report = $this->report('2026-09-29 10:00:00', ['affected_area_hectares' => 1.2, 'field_survey_client_uuid' => $broken->client_uuid]);
        $before = $this->checksums();

        $result = $this->apply();

        $this->assertSame(1, $result['exit'], 'the re-audit still finds the row, so the command fails');
        $this->assertSame($before, $this->checksums());
        $this->assertSame([$report->id], $result['json']['remaining']['B']);
        $this->assertSame('report', $result['json']['applied']['skipped'][0]['target']);
        $this->assertSame(0, ReportAudit::query()->count());
    }

    public function test_a_failed_audit_write_rolls_the_row_back(): void
    {
        $fixture = $this->seedProductionShape();
        FieldSurveyAudit::creating(function (): void {
            throw new \RuntimeException('audit write failed');
        });

        try {
            $this->apply(['--buckets' => 'A']);
            $this->fail('the failure must not be swallowed');
        } catch (\RuntimeException $exception) {
            $this->assertSame('audit write failed', $exception->getMessage());
        } finally {
            FieldSurveyAudit::flushEventListeners();
        }

        $row = $fixture['aSurveys'][0]->fresh();
        $this->assertSame('0.0000', $row->affected_area_sqm, 'the survey change rolled back with its audit');
        $this->assertNull($row->affected_area_measurement);
        $this->assertSame(0, FieldSurveyAudit::query()->count());
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array{exit: int, json: array<string, mixed>}
     */
    private function apply(array $options = []): array
    {
        $exit = Artisan::call('caneguard:audit-survey-measurements', $options + [
            '--apply' => true,
            '--actor' => $this->inspector->id,
            '--json' => true,
        ]);

        return ['exit' => $exit, 'json' => json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR)];
    }

    /**
     * What the production audit looked like: one B report with a real affected
     * polygon, and several B reports linked to plot-only (bucket A) surveys.
     *
     * @return array<string, mixed>
     */
    private function seedProductionShape(): array
    {
        $polygon = ['type' => 'Polygon', 'coordinates' => [[[122.95, 10.7], [122.9502, 10.7], [122.95, 10.7002], [122.95, 10.7]]]];
        $submitted = '2026-09-29 10:00:00'; // Asia/Manila Tuesday, week of 2026-09-28

        $real = $this->survey(12000, ['affected_area_polygons' => [$polygon], 'affected_area_sqm' => 3000, 'affected_area_measurement' => 'measured']);
        $realReport = $this->report($submitted, [
            'affected_area_hectares' => 1.2,
            'affected_portion_percent' => 100,
            'affected_portion_measurement' => 'measured',
            'field_survey_client_uuid' => $real->client_uuid,
        ]);

        $aSurveys = [];
        $aReports = [];
        foreach ([0, 1, 2] as $index) {
            $aSurveys[$index] = $this->survey(13000 + $index * 1000, ['affected_area_polygons' => [], 'affected_area_sqm' => 0]);
            $aReports[$index] = $this->report($submitted, [
                'affected_area_hectares' => 1.3 + $index / 10,
                'affected_portion_percent' => 100,
                'affected_portion_measurement' => 'measured',
                'field_survey_client_uuid' => $aSurveys[$index]->client_uuid,
            ]);
        }

        if (! DB::table('district_report_versions')->where('week_start', '2026-09-28')->exists()) {
            $this->version('district_report_versions', '2026-09-28');
        }

        return compact('real', 'realReport', 'aSurveys', 'aReports');
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    private function audit(array $options = []): array
    {
        $this->assertSame(0, Artisan::call('caneguard:audit-survey-measurements', $options + ['--json' => true]));

        return json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @return array<string, string>
     */
    private function checksums(): array
    {
        $checksums = [];
        foreach (['reports', 'field_surveys', 'report_affected_field_surveys', 'report_audits', 'field_survey_audits', 'district_report_versions', 'district_rssi_report_versions'] as $table) {
            $rows = DB::table($table)->orderBy('id')->get()->all();
            $checksums[$table] = count($rows).':'.md5(json_encode($rows, JSON_THROW_ON_ERROR));
        }

        return $checksums;
    }

    /**
     * @return array<string, mixed>
     */
    private function seedFixture(): array
    {
        $polygon = ['type' => 'Polygon', 'coordinates' => [[[122.95, 10.7], [122.9502, 10.7], [122.95, 10.7002], [122.95, 10.7]]]];

        // A: what an older phone stored for a plot-only 1.2 ha survey, plus a confirmed zero that is fine.
        $plotOnly = $this->survey(12000, ['affected_area_polygons' => [], 'affected_area_sqm' => 0]);
        $this->survey(12000, ['affected_area_polygons' => [], 'affected_area_sqm' => 0, 'affected_area_measurement' => 'measured']);
        // A clean drawn survey: 0.3 ha of a 1.2 ha plot.
        $drawn = $this->survey(12000, ['affected_area_polygons' => [$polygon], 'affected_area_sqm' => 3000, 'affected_area_measurement' => 'measured']);
        // D: a 40 m2 patch.
        $patch = $this->survey(12000, ['affected_area_polygons' => [$polygon], 'affected_area_sqm' => 40, 'affected_area_measurement' => 'measured']);

        $submitted = '2026-09-29 10:00:00'; // Asia/Manila Tuesday, week of 2026-09-28

        // B by client uuid and by office link: affected figure equals the plot (1.2 ha / 1.205 ha).
        $mappedByUuid = $this->report($submitted, ['affected_area_hectares' => 1.2, 'field_survey_client_uuid' => strtoupper($plotOnly->client_uuid)]);
        $mappedByLink = $this->report($submitted, ['affected_area_hectares' => 1.205]);
        $mappedByLink->affectedFieldSurveys()->attach($plotOnly->id, ['loss_rate_percent' => null]);
        // A report whose affected figure really is the drawn 0.3 ha is not B.
        $clean = $this->report($submitted, [
            'plot_area_hectares' => 1.2, 'plot_area_measurement' => 'measured',
            'affected_area_hectares' => 0.3, 'field_survey_client_uuid' => $drawn->client_uuid,
        ]);
        // C
        $flagNotMeasured = $this->report($submitted, ['affected_area_hectares' => 2, 'affected_area_measurement' => 'not_measured']);
        $flagMeasuredEmpty = $this->report($submitted, ['plot_area_hectares' => null, 'plot_area_measurement' => 'measured', 'affected_area_measurement' => 'not_measured']);
        // D
        $tiny = $this->report($submitted, ['affected_area_hectares' => 0, 'field_survey_client_uuid' => $patch->client_uuid]);
        // A report in an unrelated week with no problem.
        $this->report('2026-11-04 10:00:00', ['affected_area_hectares' => 0.5]);

        $weekly = $this->version('district_report_versions', '2026-09-28');
        $otherWeek = $this->version('district_report_versions', '2026-10-05');
        $rssi = $this->version('district_rssi_report_versions', '2026-09-28');

        return compact('plotOnly', 'mappedByUuid', 'mappedByLink', 'clean', 'flagNotMeasured', 'flagMeasuredEmpty', 'tiny', 'weekly', 'otherWeek', 'rssi');
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function survey(float $areaSqm, array $attributes): FieldSurvey
    {
        return FieldSurvey::query()->create($attributes + [
            'client_uuid' => (string) Str::uuid(),
            'inspector_id' => $this->inspector->id,
            'district_id' => $this->district->id,
            'polygon' => ['type' => 'Polygon', 'coordinates' => [[[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]]]],
            'area_sqm' => $areaSqm,
            'captured_at' => '2026-09-28 02:30:12.123456',
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function report(string $submittedAt, array $attributes): Report
    {
        return Report::factory()->inDistrict($this->district)->create($attributes + [
            'submitted_at' => $submittedAt,
            'affected_area_hectares' => null,
            'affected_area_measurement' => 'measured',
            'plot_area_hectares' => null,
            'plot_area_measurement' => 'not_measured',
            'affected_portion_percent' => null,
            'affected_portion_measurement' => 'not_measured',
        ]);
    }

    private function version(string $table, string $weekStart): int
    {
        $row = [
            'uuid' => (string) Str::uuid(),
            'district_id' => $this->district->id,
            'week_start' => $weekStart,
            'version' => 1,
            'content_hash' => str_repeat('a', 64),
            'content' => '{}',
            'source_refs' => '[]',
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if ($table === 'district_rssi_report_versions') {
            $row += ['pdf_sha256' => str_repeat('b', 64), 'pdf_bytes' => '', 'csv_sha256' => str_repeat('c', 64), 'csv_content' => ''];
        } else {
            $row += ['prepared_by_id' => $this->inspector->id];
        }

        return (int) DB::table($table)->insertGetId($row);
    }
}
