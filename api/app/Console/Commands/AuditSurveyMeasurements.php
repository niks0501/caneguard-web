<?php

namespace App\Console\Commands;

use App\Models\FieldSurvey;
use App\Models\FieldSurveyAudit;
use App\Models\Report;
use App\Models\ReportAudit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Console\ConfirmableTrait;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Audit, and optionally remediate, how survey measurements reached reports.
 *
 * It classifies historical rows into five buckets so the office can size the
 * damage. By default it is a dry run: only SELECT statements run, the planned
 * change for every row is printed (old -> new), and sealed weekly versions are
 * listed, never touched.
 *
 *  A  survey stored a forced 0 for an affected area that was never measured
 *  B  report carries the plot area in its affected-area figure
 *  C  report measurement flag disagrees with its value
 *  D  report rounded a real patch (under 50 m2) to 0
 *  E  sealed weekly versions whose period contains a B, C or D report
 *
 * `--apply --actor=<user>` remediates buckets A-D (`--buckets=` narrows them).
 * Each survey or report changes in its own transaction together with its audit
 * rows (field_survey_audits / report_audits), so a row is either fully fixed and
 * recorded or untouched. A fixed row no longer matches its bucket, which makes a
 * second run a no-op that writes nothing. Bucket E is never applied: sealed
 * versions stay byte-identical and the command only prints the affected weeks.
 */
final class AuditSurveyMeasurements extends Command
{
    use ConfirmableTrait;

    /** Written to every audit row's reason, followed by the bucket(s) that changed the field. */
    public const REMEDIATION_REASON = 'survey_measurement_mapping_remediation';

    /** Buckets that can be applied. E is informational only. */
    private const APPLICABLE_BUCKETS = ['A', 'B', 'C', 'D'];

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

    /** Report fields this command may change, in the order they are shown. */
    private const REPORT_FIELDS = [
        'plot_area_hectares', 'plot_area_measurement',
        'affected_area_hectares', 'affected_area_measurement',
        'affected_portion_percent', 'affected_portion_measurement',
    ];

    protected $signature = 'caneguard:audit-survey-measurements
        {--json : Print the buckets as JSON}
        {--apply : Write the planned changes for buckets A-D (default is a read-only dry run)}
        {--buckets= : Comma-separated buckets to plan or apply, from A,B,C,D (default all four; E is never applied)}
        {--actor= : User id or email recorded as the actor on audit rows; required with --apply}
        {--force : Apply in production without the confirmation prompt}';

    protected $description = 'Classify surveys and reports whose plot, affected-area and percentage measurements were mixed up (buckets A-E). Dry run by default; --apply remediates A-D with audit rows';

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

        $buckets = $this->selectedBuckets();
        if ($buckets === null) {
            return self::FAILURE;
        }

        $apply = (bool) $this->option('apply');
        $actor = null;
        if ($apply) {
            foreach (['field_survey_audits', 'report_audits'] as $table) {
                if (! Schema::hasTable($table)) {
                    $this->error("{$table} is missing. Run the pending migrations first; nothing was changed.");

                    return self::FAILURE;
                }
            }

            $actor = $this->resolveActor();
            if ($actor === null) {
                return self::FAILURE;
            }

            if (! $this->confirmToProceed()) {
                return self::FAILURE;
            }
        }

        $this->runAudit();

        $summary = $this->summary();
        $plan = $this->plan($buckets);
        $summary['planned_changes'] = $plan['planned'];

        if (! $apply) {
            if ($this->option('json')) {
                $this->line(json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

                return self::SUCCESS;
            }

            $this->printSummaryTable($summary);
            $this->printPlan($plan['planned'], $buckets);
            $this->info('Read-only audit: nothing was changed. Sealed versions in bucket E are never altered.');
            if ($this->hasPlannedChanges($plan['planned'])) {
                $this->line('To write these changes: back up the database, then re-run with --apply --actor=<user id or email>.');
            }

            return self::SUCCESS;
        }

        if (! $this->option('json')) {
            $this->printSummaryTable($summary);
            $this->printPlan($plan['planned'], $buckets);
            $this->line('Applying as user #'.$actor->id.'. Each row changes in its own transaction with its audit rows.');
        }

        $applied = $this->applyPlan($buckets, $actor);

        // The command only succeeds when a fresh audit finds nothing left in the buckets it fixed.
        $this->runAudit();
        $remaining = [];
        foreach ($buckets as $bucket) {
            if ($this->items[$bucket] !== []) {
                $remaining[$bucket] = $this->summary()['buckets'][$bucket]['ids'];
            }
        }
        $failed = $remaining !== [] || $applied['skipped'] !== [];

        $summary['read_only'] = false;
        $summary['applied'] = $applied;
        $summary['remaining'] = $remaining;

        if ($this->option('json')) {
            $this->line(json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

            return $failed ? self::FAILURE : self::SUCCESS;
        }

        $this->printApplied($applied);

        if ($failed) {
            foreach ($applied['skipped'] as $skipped) {
                $this->warn("Bucket {$skipped['bucket']} {$skipped['target']} {$skipped['id']} was not changed: {$skipped['reason']}");
            }
            foreach ($remaining as $bucket => $ids) {
                $this->error("Re-audit: bucket {$bucket} still has rows: ".$this->describeIds($bucket, $ids));
            }

            return self::FAILURE;
        }

        $this->info('Re-audit clean: buckets '.implode(',', $buckets).' have no remaining rows. Sealed versions were not altered.');

        return self::SUCCESS;
    }

    /** @return list<string>|null null when the option is invalid (an error was printed) */
    private function selectedBuckets(): ?array
    {
        $option = $this->option('buckets');
        if ($option === null || trim((string) $option) === '') {
            return self::APPLICABLE_BUCKETS;
        }

        $buckets = [];
        foreach (explode(',', strtoupper((string) $option)) as $bucket) {
            $bucket = trim($bucket);
            if ($bucket === 'E') {
                $this->error('Bucket E (sealed versions) is never applied; it is only listed. Choose from A, B, C, D.');

                return null;
            }
            if (! in_array($bucket, self::APPLICABLE_BUCKETS, true)) {
                $this->error("Unknown bucket '{$bucket}'. Choose from A, B, C, D.");

                return null;
            }
            $buckets[$bucket] = $bucket;
        }

        $buckets = array_values($buckets);
        sort($buckets);

        return $buckets;
    }

    private function resolveActor(): ?User
    {
        $value = trim((string) $this->option('actor'));
        if ($value === '') {
            $this->error('--apply needs --actor=<user id or email>: every audit row records who ran the remediation. Nothing was changed.');

            return null;
        }

        $actor = ctype_digit($value)
            ? User::query()->find((int) $value)
            : User::query()->where('email', $value)->first();

        if ($actor === null) {
            $this->error('--actor does not match a user. Nothing was changed.');
        }

        return $actor;
    }

    private function runAudit(): void
    {
        $this->items = array_fill_keys(array_keys(self::BUCKETS), []);

        $this->auditSurveys();
        $this->auditReports();
        $this->auditSealedVersions();
    }

    /** @param  array<string, mixed>  $summary */
    private function printSummaryTable(array $summary): void
    {
        $this->table(
            ['Bucket', 'Meaning', 'Count', 'Ids'],
            array_map(fn (string $bucket): array => [
                $bucket,
                self::BUCKETS[$bucket],
                $summary['buckets'][$bucket]['count'],
                $this->describeIds($bucket, $summary['buckets'][$bucket]['ids']),
            ], array_keys(self::BUCKETS)),
        );
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
                if ($survey !== null && $this->plotNeedsRemediation($report, $survey)) {
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

    /**
     * Patches under half a square metre stay out: they are 0.0000 ha at the
     * column's four decimals, so restoring them could not change the stored value.
     */
    private function tinyPatchRoundedToZero(object $report, object $survey): bool
    {
        return $report->affected_area_hectares !== null
            && (float) $report->affected_area_hectares === 0.0
            && $survey->affected_area_sqm !== null
            && (float) $survey->affected_area_sqm > 0.0
            && (float) $survey->affected_area_sqm < self::TINY_PATCH_SQM
            && round((float) $survey->affected_area_sqm / 10000, 4) > 0.0;
    }

    /**
     * B only counts while the report still differs from what its survey says.
     * Without this a report whose real affected figure happens to sit within
     * 0.01 ha of the plot would stay in B after it was fixed. An ambiguous
     * survey (no target) stays flagged so it is never silently dropped.
     */
    private function plotNeedsRemediation(object $report, object $survey): bool
    {
        $target = $this->plotTarget($survey);

        if ($target === null) {
            return true;
        }

        $state = $this->reportState($report);
        foreach ($target as $field => $value) {
            if (! $this->sameState($state[$field], $value)) {
                return true;
            }
        }

        return false;
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

    /** @return array<string, mixed> */
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

    // ------------------------------------------------------------------
    // Planning: what each bucket would change. Reads only.
    // ------------------------------------------------------------------

    /**
     * @param  list<string>  $buckets
     * @return array{planned: array<string, list<array<string, mixed>>>, reports: array<int, array<string, mixed>>}
     */
    private function plan(array $buckets): array
    {
        $planned = ['A' => [], 'B' => [], 'C' => [], 'D' => [], 'E' => []];
        $reportPlans = [];

        if (in_array('A', $buckets, true)) {
            foreach ($this->items['A'] as $item) {
                $survey = DB::table('field_surveys')->where('id', $item['field_survey_id'])->first();
                $changes = $survey === null ? [] : $this->planSurvey($survey);
                if ($changes !== []) {
                    $planned['A'][] = $item + ['changes' => $changes];
                }
            }
        }

        $reportIds = [];
        foreach (array_intersect($buckets, ['B', 'C', 'D']) as $bucket) {
            foreach ($this->items[$bucket] as $item) {
                $reportIds[$item['report_id']] = $item['report_id'];
            }
        }
        sort($reportIds);

        foreach (array_chunk($reportIds, 500) as $ids) {
            $reports = DB::table('reports')->whereIn('id', $ids)->orderBy('id')->get();
            $linked = $this->linkedSurveys($reports);

            foreach ($reports as $report) {
                $reportPlan = $this->planReport($report, $linked[$report->id] ?? [], $buckets);
                $reportPlans[(int) $report->id] = $reportPlan;

                $byBucket = $reportPlan['by_bucket'];
                if ($reportPlan['ambiguous']) {
                    $byBucket['B'] ??= [];
                }

                foreach ($byBucket as $bucket => $changes) {
                    $entry = ['report_id' => (int) $report->id, 'reference_code' => $report->reference_code];
                    if ($reportPlan['field_survey_id'] !== null && in_array($bucket, ['B', 'D'], true)) {
                        $entry['field_survey_id'] = $reportPlan['field_survey_id'];
                    }
                    $entry['changes'] = $changes;
                    if ($bucket === 'B' && $reportPlan['ambiguous']) {
                        $entry['needs_manual_review'] = $reportPlan['ambiguous_reason'];
                    }
                    $planned[$bucket][] = $entry;
                }
            }
        }

        foreach (['B', 'C', 'D'] as $bucket) {
            usort($planned[$bucket], fn (array $a, array $b): int => $a['report_id'] <=> $b['report_id']);
        }

        $planned['E'] = $this->planSealedVersions($reportPlans);

        return ['planned' => $planned, 'reports' => $reportPlans];
    }

    /**
     * Bucket A: the survey's forced 0 was never a measurement.
     *
     * @return array<string, array{old: mixed, new: mixed}>
     */
    private function planSurvey(object $survey): array
    {
        if (! $this->isForcedZero($survey)) {
            return [];
        }

        $changes = ['affected_area_sqm' => ['old' => (float) $survey->affected_area_sqm, 'new' => null]];

        if ($survey->affected_area_measurement !== FieldSurvey::MEASUREMENT_NOT_MEASURED) {
            $changes['affected_area_measurement'] = [
                'old' => $survey->affected_area_measurement,
                'new' => FieldSurvey::MEASUREMENT_NOT_MEASURED,
            ];
        }

        return $changes;
    }

    /**
     * Combine every selected bucket's change for one report, applied in order
     * B, D, C on a working copy so a report in several buckets is fixed once.
     *
     * @param  list<object>  $linked
     * @param  list<string>  $buckets
     * @return array{
     *     field_survey_id: ?int,
     *     changes: array<string, array{old: mixed, new: mixed, buckets: list<string>}>,
     *     by_bucket: array<string, array<string, array{old: mixed, new: mixed}>>,
     *     ambiguous: bool,
     *     ambiguous_reason: ?string,
     *     hectares: array{before: float, after: float}
     * }
     */
    private function planReport(object $report, array $linked, array $buckets): array
    {
        $original = $this->reportState($report);
        $state = $original;
        $tags = [];
        $surveyId = null;
        $ambiguous = false;
        $ambiguousReason = null;

        $set = function (string $bucket, array $values) use (&$state, &$tags): void {
            foreach ($values as $field => $value) {
                if (! $this->sameState($state[$field], $value)) {
                    $state[$field] = $value;
                    $tags[$field][$bucket] = $bucket;
                }
            }
        };

        if (in_array('B', $buckets, true)) {
            $survey = $this->firstMatching($linked, fn (object $candidate): bool => $this->plotMappedAsAffected($report, $candidate));
            if ($survey !== null) {
                $surveyId = (int) $survey->id;
                $target = $this->plotTarget($survey);
                if ($target === null) {
                    $ambiguous = true;
                    $ambiguousReason = "survey {$survey->id} is marked measured but has no affected area figure";
                } else {
                    $set('B', $target);
                }
            }
        }

        if (in_array('D', $buckets, true)) {
            $survey = $this->firstMatching($linked, fn (object $candidate): bool => $this->tinyPatchRoundedToZero($report, $candidate));
            if ($survey !== null) {
                $surveyId ??= (int) $survey->id;
                $set('D', [
                    'affected_area_hectares' => round((float) $survey->affected_area_sqm / 10000, 4),
                    'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
                ]);
            }
        }

        if (in_array('C', $buckets, true)) {
            $flags = [];
            foreach (self::REPORT_PAIRS as $valueField => $measurementField) {
                if ($state[$measurementField] === Report::MEASUREMENT_NOT_MEASURED && $state[$valueField] !== null) {
                    $flags[$measurementField] = Report::MEASUREMENT_MEASURED;
                } elseif ($state[$measurementField] === Report::MEASUREMENT_MEASURED && $state[$valueField] === null) {
                    $flags[$measurementField] = Report::MEASUREMENT_NOT_MEASURED;
                }
            }
            $set('C', $flags);
        }

        $changes = [];
        $byBucket = [];
        foreach (self::REPORT_FIELDS as $field) {
            if ($this->sameState($original[$field], $state[$field])) {
                continue;
            }
            $fieldBuckets = array_values($tags[$field] ?? []);
            $changes[$field] = ['old' => $original[$field], 'new' => $state[$field], 'buckets' => $fieldBuckets];
            foreach ($fieldBuckets as $bucket) {
                $byBucket[$bucket][$field] = ['old' => $original[$field], 'new' => $state[$field]];
            }
        }
        ksort($byBucket);

        return [
            'field_survey_id' => $surveyId,
            'changes' => $changes,
            'by_bucket' => $byBucket,
            'ambiguous' => $ambiguous,
            'ambiguous_reason' => $ambiguousReason,
            'hectares' => [
                'before' => $this->countedHectares($original),
                'after' => $this->countedHectares($state),
            ],
        ];
    }

    /**
     * What a survey says the report's three figures should be (bucket B), or
     * null when the survey contradicts itself (measured, but no figure).
     *
     * A survey whose affected area was never measured gives no affected figure
     * and no percentage, never 0. A measured one gives its own area and share,
     * by the same rule as ReportAffectedFieldResource::affectedPercent().
     *
     * @return array<string, float|string|null>|null
     */
    private function plotTarget(object $survey): ?array
    {
        $plotSqm = (float) $survey->area_sqm;
        $target = [
            'plot_area_hectares' => round($plotSqm / 10000, 4),
            'plot_area_measurement' => Report::MEASUREMENT_MEASURED,
        ];

        if (! $this->surveyAffectedMeasured($survey)) {
            return $target + [
                'affected_area_hectares' => null,
                'affected_area_measurement' => Report::MEASUREMENT_NOT_MEASURED,
                'affected_portion_percent' => null,
                'affected_portion_measurement' => Report::MEASUREMENT_NOT_MEASURED,
            ];
        }

        if ($survey->affected_area_sqm === null) {
            return null;
        }

        $affectedSqm = (float) $survey->affected_area_sqm;
        $percent = $plotSqm > 0 ? round(min(100.0, $affectedSqm / $plotSqm * 100), 1) : null;

        return $target + [
            'affected_area_hectares' => round($affectedSqm / 10000, 4),
            'affected_area_measurement' => Report::MEASUREMENT_MEASURED,
            'affected_portion_percent' => $percent,
            'affected_portion_measurement' => $percent === null ? Report::MEASUREMENT_NOT_MEASURED : Report::MEASUREMENT_MEASURED,
        ];
    }

    /** Mirrors FieldSurvey::affectedAreaMeasurement() on a raw row, so a legacy forced 0 reads as not measured. */
    private function surveyAffectedMeasured(object $survey): bool
    {
        if ($survey->affected_area_measurement !== null) {
            return $survey->affected_area_measurement === FieldSurvey::MEASUREMENT_MEASURED;
        }

        if ($survey->affected_area_sqm === null) {
            return false;
        }

        return ! ((float) $survey->affected_area_sqm <= 0.0 && $this->hasNoPolygons($survey));
    }

    /** @return array<string, float|string|null> */
    private function reportState(object $report): array
    {
        $state = [];
        foreach (self::REPORT_FIELDS as $field) {
            $value = $report->{$field};
            $state[$field] = $value === null ? null : (str_ends_with($field, '_measurement') ? (string) $value : (float) $value);
        }

        return $state;
    }

    private function sameState(mixed $a, mixed $b): bool
    {
        if ($a === null || $b === null) {
            return $a === $b;
        }

        if (is_string($a) || is_string($b)) {
            return $a === $b;
        }

        return round((float) $a, 4) === round((float) $b, 4);
    }

    /**
     * Hectares a weekly total would count for this report: a figure marked not
     * measured is excluded, exactly as the weekly builders exclude it.
     *
     * @param  array<string, float|string|null>  $state
     */
    private function countedHectares(array $state): float
    {
        $value = $state['affected_area_hectares'];
        if ($value === null) {
            return 0.0;
        }

        $measurement = $state['affected_area_measurement'] ?? Report::MEASUREMENT_MEASURED;

        return $measurement === Report::MEASUREMENT_NOT_MEASURED ? 0.0 : (float) $value;
    }

    /**
     * Bucket E: sealed versions are only described, with the hectare change
     * their week would see, so the office can reissue by hand if it chooses.
     *
     * @param  array<int, array<string, mixed>>  $reportPlans
     * @return list<array<string, mixed>>
     */
    private function planSealedVersions(array $reportPlans): array
    {
        $planned = [];

        foreach ($this->items['E'] as $item) {
            $before = 0.0;
            $after = 0.0;
            $changedReports = [];

            foreach ($item['report_ids'] as $reportId) {
                $plan = $reportPlans[$reportId] ?? null;
                if ($plan === null || $plan['changes'] === []) {
                    continue;
                }
                $before += $plan['hectares']['before'];
                $after += $plan['hectares']['after'];
                $changedReports[] = $reportId;
            }

            $planned[] = $item + [
                'week' => CarbonImmutable::parse($item['week_start'], self::TIMEZONE)->format('o-\WW'),
                'changed_report_ids' => $changedReports,
                'affected_hectares_before' => round($before, 4),
                'affected_hectares_after' => round($after, 4),
                'affected_hectares_change' => round($after - $before, 4),
                'sealed_version_changed' => false,
            ];
        }

        return $planned;
    }

    // ------------------------------------------------------------------
    // Applying: one transaction per row, with its audit rows.
    // ------------------------------------------------------------------

    /**
     * @param  list<string>  $buckets
     * @return array{surveys: list<array<string, mixed>>, reports: list<array<string, mixed>>, skipped: list<array<string, mixed>>, audit_rows: int}
     */
    private function applyPlan(array $buckets, User $actor): array
    {
        $result = ['surveys' => [], 'reports' => [], 'skipped' => [], 'audit_rows' => 0];

        if (in_array('A', $buckets, true)) {
            foreach (array_column($this->items['A'], 'field_survey_id') as $surveyId) {
                $applied = DB::transaction(fn (): ?array => $this->applySurvey((int) $surveyId, $actor));
                if ($applied !== null) {
                    $result['surveys'][] = $applied;
                    $result['audit_rows'] += count($applied['changes']);
                }
            }
        }

        $reportIds = [];
        foreach (array_intersect($buckets, ['B', 'C', 'D']) as $bucket) {
            foreach ($this->items[$bucket] as $item) {
                $reportIds[$item['report_id']] = $item['report_id'];
            }
        }
        sort($reportIds);

        foreach ($reportIds as $reportId) {
            $applied = DB::transaction(fn (): ?array => $this->applyReport((int) $reportId, $buckets, $actor));
            if ($applied === null) {
                continue;
            }
            if ($applied['skipped'] !== null) {
                $result['skipped'][] = $applied['skipped'];
            }
            if ($applied['changes'] !== []) {
                $result['reports'][] = $applied['row'];
                $result['audit_rows'] += count($applied['changes']);
            }
        }

        return $result;
    }

    /** @return array{field_survey_id: int, client_uuid: ?string, changes: array<string, array{old: mixed, new: mixed}>}|null */
    private function applySurvey(int $surveyId, User $actor): ?array
    {
        // Re-read under lock: a row fixed since the audit ran is left alone, so reruns write nothing.
        $survey = DB::table('field_surveys')->where('id', $surveyId)->lockForUpdate()->first();
        $changes = $survey === null ? [] : $this->planSurvey($survey);
        if ($changes === []) {
            return null;
        }

        FieldSurvey::query()->whereKey($surveyId)->update(
            array_map(fn (array $change): mixed => $change['new'], $changes),
        );

        $now = now();
        foreach ($changes as $field => $change) {
            FieldSurveyAudit::query()->create([
                'field_survey_id' => $surveyId,
                'actor_id' => $actor->id,
                'field' => $field,
                'original_value' => $change['old'],
                'corrected_value' => $change['new'],
                'reason' => self::REMEDIATION_REASON.' (bucket A)',
                'created_at' => $now,
            ]);
        }

        return ['field_survey_id' => $surveyId, 'client_uuid' => $survey->client_uuid, 'changes' => $changes];
    }

    /**
     * @param  list<string>  $buckets
     * @return array{row: array<string, mixed>, changes: array<string, mixed>, skipped: ?array<string, mixed>}|null
     */
    private function applyReport(int $reportId, array $buckets, User $actor): ?array
    {
        $report = DB::table('reports')->where('id', $reportId)->lockForUpdate()->first();
        if ($report === null) {
            return null;
        }

        $linked = $this->linkedSurveys(collect([$report]))[$report->id] ?? [];
        $plan = $this->planReport($report, $linked, $buckets);

        $skipped = $plan['ambiguous'] ? [
            'bucket' => 'B',
            'target' => 'report',
            'id' => $reportId,
            'reason' => (string) $plan['ambiguous_reason'].'; decide by hand',
        ] : null;

        if ($plan['changes'] === []) {
            return $skipped === null ? null : ['row' => [], 'changes' => [], 'skipped' => $skipped];
        }

        Report::query()->whereKey($reportId)->update(
            array_map(fn (array $change): mixed => $change['new'], $plan['changes']),
        );

        $now = now();
        foreach ($plan['changes'] as $field => $change) {
            ReportAudit::query()->create([
                'report_id' => $reportId,
                'actor_id' => $actor->id,
                'field' => $field,
                'original_value' => $change['old'],
                'corrected_value' => $change['new'],
                'reason' => self::REMEDIATION_REASON.' (bucket'.(count($change['buckets']) > 1 ? 's ' : ' ').implode(',', $change['buckets']).')',
                'created_at' => $now,
            ]);
        }

        return [
            'row' => [
                'report_id' => $reportId,
                'reference_code' => $report->reference_code,
                'field_survey_id' => $plan['field_survey_id'],
                'changes' => $plan['changes'],
            ],
            'changes' => $plan['changes'],
            'skipped' => $skipped,
        ];
    }

    // ------------------------------------------------------------------
    // Text output
    // ------------------------------------------------------------------

    /** @param  array<string, list<array<string, mixed>>>  $planned */
    private function hasPlannedChanges(array $planned): bool
    {
        foreach (['A', 'B', 'C', 'D'] as $bucket) {
            if ($planned[$bucket] !== []) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, list<array<string, mixed>>>  $planned
     * @param  list<string>  $buckets
     */
    private function printPlan(array $planned, array $buckets): void
    {
        $this->newLine();
        $this->line($this->option('apply') ? 'Planned changes (old -> new):' : 'Planned changes if applied (old -> new); dry run, nothing written:');

        $any = false;
        foreach ($buckets as $bucket) {
            foreach ($planned[$bucket] as $row) {
                $any = true;
                $subject = $bucket === 'A'
                    ? 'survey '.$row['field_survey_id']
                    : 'report '.$row['report_id'].' ('.$row['reference_code'].')';
                $this->line("  [{$bucket}] {$subject}: ".$this->describeChanges($row['changes']));
                if (isset($row['needs_manual_review'])) {
                    $this->warn("      needs manual review, not changed: {$row['needs_manual_review']}");
                }
            }
        }
        if (! $any) {
            $this->line('  none');
        }

        foreach ($planned['E'] as $version) {
            $this->line(sprintf(
                '  [E] %s #%d week %s (starts %s) v%d: %s -> affected ha %s -> %s (change %s). Sealed, not changed; reissue by hand if wanted.',
                $version['table'],
                $version['version_id'],
                $version['week'],
                $version['week_start'],
                $version['version'],
                $version['changed_report_ids'] === [] ? 'no selected report changes' : 'reports '.implode(',', $version['changed_report_ids']),
                $this->formatValue($version['affected_hectares_before']),
                $this->formatValue($version['affected_hectares_after']),
                $this->formatValue($version['affected_hectares_change']),
            ));
        }
    }

    /** @param  array{surveys: list<array<string, mixed>>, reports: list<array<string, mixed>>, skipped: list<array<string, mixed>>, audit_rows: int}  $applied */
    private function printApplied(array $applied): void
    {
        $this->newLine();
        foreach ($applied['surveys'] as $row) {
            $this->line("  changed survey {$row['field_survey_id']}: ".$this->describeChanges($row['changes']));
        }
        foreach ($applied['reports'] as $row) {
            $this->line("  changed report {$row['report_id']} ({$row['reference_code']}): ".$this->describeChanges($row['changes']));
        }
        $this->info(sprintf(
            'Changed %d survey(s) and %d report(s); wrote %d audit row(s).',
            count($applied['surveys']),
            count($applied['reports']),
            $applied['audit_rows'],
        ));
        $this->line('To reverse a row by hand: the old value of every field is in field_survey_audits.original_value / report_audits.original_value for reason LIKE \''.self::REMEDIATION_REASON.'%\'.');
    }

    /** @param  array<string, array<string, mixed>>  $changes */
    private function describeChanges(array $changes): string
    {
        if ($changes === []) {
            return 'no change';
        }

        return implode('; ', array_map(
            fn (string $field, array $change): string => $field.' '.$this->formatValue($change['old']).' -> '.$this->formatValue($change['new']),
            array_keys($changes),
            $changes,
        ));
    }

    private function formatValue(mixed $value): string
    {
        if ($value === null) {
            return 'null';
        }

        if (is_float($value) || is_int($value)) {
            $formatted = rtrim(rtrim(number_format((float) $value, 4, '.', ''), '0'), '.');

            return $formatted === '' || $formatted === '-0' ? '0' : $formatted;
        }

        return (string) $value;
    }
}
