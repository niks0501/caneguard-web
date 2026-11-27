<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\FieldSurvey;
use App\Models\Report;
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

    /**
     * @return array<string, mixed>
     */
    private function audit(): array
    {
        $this->assertSame(0, Artisan::call('caneguard:audit-survey-measurements', ['--json' => true]));

        return json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @return array<string, string>
     */
    private function checksums(): array
    {
        $checksums = [];
        foreach (['reports', 'field_surveys', 'report_affected_field_surveys', 'report_audits', 'district_report_versions', 'district_rssi_report_versions'] as $table) {
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
