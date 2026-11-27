<?php

namespace App\Console\Commands;

use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Read-only audit of how survey measurements reached reports.
 *
 * It classifies historical rows into five buckets so the office can size the
 * damage before any remediation exists. It never writes: only SELECT statements
 * run, and sealed weekly versions are listed, never touched.
 *
 *  A  survey stored a forced 0 for an affected area that was never measured
 *  B  report carries the plot area in its affected-area figure
 *  C  report measurement flag disagrees with its value
 *  D  report rounded a real patch (under 50 m2) to 0
 *  E  sealed weekly versions whose period contains a B, C or D report
 */
final class AuditSurveyMeasurements extends Command
{
    /** B: how close the affected figure must sit to the plot area to count as "the plot". */
    private const PLOT_MATCH_TOLERANCE_HECTARES = 0.01;

    /** B: affected and plot square metres closer than this are the same figure, not a float difference. */
    private const SQM_EQUALITY_TOLERANCE = 0.01;

    /** D: a patch below this many square metres was rounded to 0.00 by the old decimal(12,2) column. */
    private const TINY_PATCH_SQM = 50.0;

    private const TIMEZONE = 'Asia/Manila';

    private const BUCKETS = [
        'A' => 'Unmeasured survey stored as 0',
        'B' => 'Plot area mapped as affected area',
        'C' => 'Measurement flag disagrees with value',
        'D' => 'Tiny positive patch rounded to 0',
        'E' => 'Sealed weekly versions containing a B, C or D report',
    ];

    /** Report value field => its measurement flag. */
    private const REPORT_PAIRS = [
        'plot_area_hectares' => 'plot_area_measurement',
        'affected_area_hectares' => 'affected_area_measurement',
        'affected_portion_percent' => 'affected_portion_measurement',
    ];

    protected $signature = 'caneguard:audit-survey-measurements {--json : Print the buckets as JSON}';

    protected $description = 'Read-only: classify surveys and reports whose plot, affected-area and percentage measurements were mixed up (buckets A-E); writes nothing';

    /** @var array<string, list<array<string, mixed>>> */
    private array $items = [];

    public function handle(): int
    {
        foreach (['reports' => 'plot_area_measurement', 'field_surveys' => 'affected_area_measurement'] as $table => $column) {
            if (! Schema::hasColumn($table, $column)) {
                $this->error("{$table}.{$column} is missing. Run the pending migrations first; this command reads only.");

                return self::FAILURE;
            }
        }

        $this->items = array_fill_keys(array_keys(self::BUCKETS), []);

        $this->auditSurveys();
        $this->auditReports();
        $this->auditSealedVersions();

        $summary = $this->summary();

        if ($this->option('json')) {
            $this->line(json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

            return self::SUCCESS;
        }

        $this->table(
            ['Bucket', 'Meaning', 'Count', 'Ids'],
            array_map(fn (string $bucket): array => [
                $bucket,
                self::BUCKETS[$bucket],
                $summary['buckets'][$bucket]['count'],
                $this->describeIds($bucket, $summary['buckets'][$bucket]['ids']),
            ], array_keys(self::BUCKETS)),
        );
        $this->info('Read-only audit: nothing was changed. Sealed versions in bucket E are never altered.');

        return self::SUCCESS;
    }

    /** Bucket A. */
    private function auditSurveys(): void
    {
        DB::table('field_surveys')->orderBy('id')->chunkById(500, function (Collection $surveys): void {
            foreach ($surveys as $survey) {
                if ($this->isForcedZero($survey)) {
                    $this->items['A'][] = [
                        'field_survey_id' => (int) $survey->id,
                        'client_uuid' => $survey->client_uuid,
                    ];
                }
            }
        });
    }

    /**
     * Empty or missing affected polygons with a stored 0 is what older phones
     * sent for a plot-only survey, so it could never have been a confirmed zero.
     * A survey the inspector explicitly confirmed (`measured`) is a real zero.
     */
    private function isForcedZero(object $survey): bool
    {
        return $this->hasNoPolygons($survey)
            && $survey->affected_area_sqm !== null
            && (float) $survey->affected_area_sqm === 0.0
            && $survey->affected_area_measurement !== 'measured';
    }

    /** Buckets B, C and D. */
    private function auditReports(): void
    {
        DB::table('reports')->orderBy('id')->chunkById(500, function (Collection $reports): void {
            $surveys = $this->linkedSurveys($reports);

            foreach ($reports as $report) {
                $linked = $surveys[$report->id] ?? [];

                $survey = $this->firstMatching($linked, fn (object $candidate): bool => $this->plotMappedAsAffected($report, $candidate));
                if ($survey !== null) {
                    $this->items['B'][] = $this->reportItem($report) + ['field_survey_id' => (int) $survey->id];
                }

                $fields = $this->desyncedFields($report);
                if ($fields !== []) {
                    $this->items['C'][] = $this->reportItem($report) + ['fields' => $fields];
                }

                $survey = $this->firstMatching($linked, fn (object $candidate): bool => $this->tinyPatchRoundedToZero($report, $candidate));
                if ($survey !== null) {
                    $this->items['D'][] = $this->reportItem($report) + ['field_survey_id' => (int) $survey->id];
                }
            }
        });
    }

    /**
     * A report is linked to a survey by the uuid the phone sent
     * (reports.field_survey_client_uuid) or by an office link
     * (report_affected_field_surveys). Surveys come back in id order, so the
     * survey named in an item is always the lowest-id match.
     *
     * @param  Collection<int, object>  $reports
     * @return array<int, list<object>> report id => linked surveys
     */
    private function linkedSurveys(Collection $reports): array
    {
        $uuids = $reports->pluck('field_survey_client_uuid')->filter()
            ->map(fn (string $uuid): string => strtolower($uuid))->unique()->values();

        $byUuid = $uuids->isEmpty() ? collect() : DB::table('field_surveys')
            ->whereIn('client_uuid', $uuids)->get()->keyBy('id');

        $pivot = Schema::hasTable('report_affected_field_surveys')
            ? DB::table('report_affected_field_surveys')->whereIn('report_id', $reports->pluck('id'))->get()
            : collect();
        $pivotSurveys = $pivot->isEmpty() ? collect() : DB::table('field_surveys')
            ->whereIn('id', $pivot->pluck('field_survey_id')->unique())->get()->keyBy('id');

        $linked = [];
        foreach ($reports as $report) {
            $found = [];
            if ($report->field_survey_client_uuid !== null) {
                $uuid = strtolower($report->field_survey_client_uuid);
                foreach ($byUuid as $survey) {
                    if ($survey->client_uuid === $uuid) {
                        $found[$survey->id] = $survey;
                    }
                }
            }
            foreach ($pivot as $link) {
                if ((int) $link->report_id === (int) $report->id && $pivotSurveys->has($link->field_survey_id)) {
                    $found[$link->field_survey_id] = $pivotSurveys->get($link->field_survey_id);
                }
            }
            ksort($found);
            $linked[$report->id] = array_values($found);
        }

        return $linked;
    }

    /** @param  list<object>  $surveys */
    private function firstMatching(array $surveys, callable $matches): ?object
    {
        foreach ($surveys as $survey) {
            if ($matches($survey)) {
                return $survey;
            }
        }

        return null;
    }

    private function plotMappedAsAffected(object $report, object $survey): bool
    {
        if ($report->affected_area_hectares === null || $survey->area_sqm === null) {
            return false;
        }

        if (abs((float) $report->affected_area_hectares - (float) $survey->area_sqm / 10000) > self::PLOT_MATCH_TOLERANCE_HECTARES) {
            return false;
        }

        return $this->hasNoPolygons($survey)
            || $survey->affected_area_sqm === null
            || abs((float) $survey->affected_area_sqm - (float) $survey->area_sqm) > self::SQM_EQUALITY_TOLERANCE;
    }

    private function tinyPatchRoundedToZero(object $report, object $survey): bool
    {
        return $report->affected_area_hectares !== null
            && (float) $report->affected_area_hectares === 0.0
            && $survey->affected_area_sqm !== null
            && (float) $survey->affected_area_sqm > 0.0
            && (float) $survey->affected_area_sqm < self::TINY_PATCH_SQM;
    }

    /**
     * Only an explicit flag can disagree: a null flag is a pre-provenance row
     * that the models read by inference.
     *
     * @return list<string>
     */
    private function desyncedFields(object $report): array
    {
        $fields = [];

        foreach (self::REPORT_PAIRS as $valueField => $measurementField) {
            $measurement = $report->{$measurementField};
            $value = $report->{$valueField};

            if (($measurement === 'not_measured' && $value !== null)
                || ($measurement === 'measured' && $value === null)) {
                $fields[] = $measurementField;
            }
        }

        return $fields;
    }

    /**
     * Bucket E. A weekly version covers the Asia/Manila Monday-to-Sunday week
     * of the reports' submitted_at in the same district. Versions are only read.
     */
    private function auditSealedVersions(): void
    {
        $affected = [];
        foreach (['B', 'C', 'D'] as $bucket) {
            foreach ($this->items[$bucket] as $item) {
                $affected[$item['report_id']] = $item['report_id'];
            }
        }
        if ($affected === []) {
            return;
        }

        $weeks = [];
        foreach (array_chunk(array_values($affected), 500) as $ids) {
            foreach (DB::table('reports')->whereIn('id', $ids)->get(['id', 'district_id', 'submitted_at']) as $report) {
                if ($report->submitted_at === null) {
                    continue;
                }
                $week = CarbonImmutable::parse($report->submitted_at, 'UTC')
                    ->setTimezone(self::TIMEZONE)->startOfWeek()->toDateString();
                $weeks[$report->district_id][$week][] = (int) $report->id;
            }
        }

        foreach (['district_report_versions', 'district_rssi_report_versions'] as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            foreach (DB::table($table)->orderBy('id')->get(['id', 'district_id', 'week_start', 'version']) as $version) {
                $week = substr((string) $version->week_start, 0, 10);
                $reportIds = $weeks[$version->district_id][$week] ?? [];
                if ($reportIds === []) {
                    continue;
                }
                sort($reportIds);
                $this->items['E'][] = [
                    'table' => $table,
                    'version_id' => (int) $version->id,
                    'district_id' => (int) $version->district_id,
                    'week_start' => $week,
                    'version' => (int) $version->version,
                    'report_ids' => $reportIds,
                ];
            }
        }
    }

    /** @return array<string, mixed> */
    private function reportItem(object $report): array
    {
        return ['report_id' => (int) $report->id, 'reference_code' => $report->reference_code];
    }

    private function hasNoPolygons(object $survey): bool
    {
        if ($survey->affected_area_polygons === null) {
            return true;
        }

        $decoded = is_string($survey->affected_area_polygons)
            ? json_decode($survey->affected_area_polygons, true)
            : $survey->affected_area_polygons;

        return $decoded === null || $decoded === [];
    }

    /** @return array{read_only: true, buckets: array<string, array<string, mixed>>} */
    private function summary(): array
    {
        $buckets = [];
        foreach (self::BUCKETS as $bucket => $label) {
            $items = $this->items[$bucket];

            if ($bucket === 'E') {
                $ids = [];
                foreach ($items as $item) {
                    $ids[$item['table']][] = $item['version_id'];
                }
                ksort($ids);
            } else {
                $key = $bucket === 'A' ? 'field_survey_id' : 'report_id';
                $ids = array_values(array_unique(array_column($items, $key)));
                sort($ids);
            }

            $buckets[$bucket] = [
                'label' => $label,
                'count' => count($items),
                'ids' => $ids,
                'items' => $items,
            ];
        }

        return ['read_only' => true, 'buckets' => $buckets];
    }

    /** @param  array<int|string, mixed>  $ids */
    private function describeIds(string $bucket, array $ids): string
    {
        if ($ids === []) {
            return '-';
        }

        if ($bucket === 'E') {
            return implode('; ', array_map(
                fn (string $table, array $versionIds): string => $table.': '.implode(',', $versionIds),
                array_keys($ids),
                $ids,
            ));
        }

        return ($bucket === 'A' ? 'surveys ' : 'reports ').implode(',', $ids);
    }
}
