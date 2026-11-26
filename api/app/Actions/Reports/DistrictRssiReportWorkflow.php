<?php

namespace App\Actions\Reports;

use App\Models\District;
use App\Models\DistrictRssiReportVersion;
use App\Models\Report;
use App\Models\User;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * Immutable weekly RSSI report snapshots (PDF + CSV) persisted per ISO week.
 * Ready to download immediately upon creation; never includes farmer names or
 * unconfirmed infestation percentages.
 */
final class DistrictRssiReportWorkflow
{
    public const RENDERER_VERSION = 'rssi-weekly-dompdf-v1';

    public function __construct(
        private readonly DistrictAccess $access,
        private readonly BuildWeeklyReportContent $periods,
        private readonly BuildWeeklyRssiReport $builder,
        private readonly ExportWeeklyRssiCsv $csvExporter,
    ) {}

    public function prepare(User $actor, string $week): DistrictRssiReportVersion
    {
        Gate::forUser($actor)->authorize('create', DistrictRssiReportVersion::class);
        $period = $this->periods->period($week);

        return DB::transaction(function () use ($actor, $period, $week): DistrictRssiReportVersion {
            $district = District::query()->lockForUpdate()->findOrFail($this->access->pilotId());

            return $this->createSnapshot($district, $period, $week, $actor, 'manual', false);
        }, attempts: 3);
    }

    public function prepareScheduled(District $district, string $week, bool $forceRefresh = false): DistrictRssiReportVersion
    {
        $period = $this->periods->period($week);

        return DB::transaction(function () use ($district, $period, $week, $forceRefresh): DistrictRssiReportVersion {
            $lockedDistrict = District::query()->lockForUpdate()->findOrFail($district->id);

            return $this->createSnapshot($lockedDistrict, $period, $week, null, 'scheduled', ! $forceRefresh);
        }, attempts: 3);
    }

    public function staleReason(DistrictRssiReportVersion $version): ?string
    {
        if (DistrictRssiReportVersion::query()->where('district_id', $version->district_id)
            ->where('week_start', $version->week_start)->where('version', '>', $version->version)->exists()) {
            return 'newer_version';
        }

        return $this->isCurrent($version) ? null : 'evidence_changed';
    }

    public function pdfBytes(DistrictRssiReportVersion $version): string
    {
        $bytes = base64_decode((string) $version->pdf_bytes, true);
        abort_unless($bytes !== false && $bytes !== '' && hash_equals((string) $version->pdf_sha256, hash('sha256', $bytes)), 409, 'The RSSI PDF snapshot could not be verified.');

        return $bytes;
    }

    public function csvContent(DistrictRssiReportVersion $version): string
    {
        $csv = (string) $version->csv_content;
        abort_unless($csv !== '' && hash_equals((string) $version->csv_sha256, hash('sha256', $csv)), 409, 'The RSSI CSV snapshot could not be verified.');

        return $csv;
    }

    public function filename(DistrictRssiReportVersion $version, string $extension): string
    {
        $district = preg_replace('/[^A-Za-z0-9_-]/', '-', (string) ($version->content['district']['code'] ?? 'district'));
        $week = (string) ($version->content['period']['week'] ?? substr((string) $version->week_start, 0, 10));

        return 'caneguard-rssi-weekly-'.$district.'-'.$week.'-v'.$version->version.'.'.$extension;
    }

    private function createSnapshot(
        District $district,
        array $period,
        string $week,
        ?User $actor,
        string $source,
        bool $keepExistingVersion,
    ): DistrictRssiReportVersion {
        $weekStart = $period['start']->toDateString();
        $latest = DistrictRssiReportVersion::query()
            ->where('district_id', $district->id)
            ->where('week_start', $weekStart)
            ->orderByDesc('version')
            ->first();

        if ($source === 'scheduled' && $latest !== null && $keepExistingVersion) {
            return $latest;
        }

        $refs = $this->sourceRefs($district->id, $weekStart, true);
        $content = $this->builder->handleForDistrict($district, $week, $actor?->name ?? 'Automated weekly scheduler');
        // Exclude volatile timestamp/author labels from content hash so identical evidence deduplicates cleanly.
        $hashPayload = $content;
        unset($hashPayload['generated_at'], $hashPayload['generated_by']);
        $hashPayload['evidence_digest'] = $this->hash($refs);
        $hash = $this->hash($hashPayload);

        if ($latest !== null && hash_equals($latest->content_hash, $hash)) {
            return $latest;
        }

        $pdfBytes = $this->renderPdf($content);
        $csvContent = $this->csvExporter->handle($content);

        return DistrictRssiReportVersion::query()->create([
            'district_id' => $district->id,
            'week_start' => $weekStart,
            'version' => 1 + (int) DistrictRssiReportVersion::query()
                ->where('district_id', $district->id)
                ->where('week_start', $weekStart)
                ->max('version'),
            'content' => $content,
            'content_hash' => $hash,
            'source_refs' => $refs,
            'prepared_source' => $source,
            'prepared_by_id' => $actor?->id,
            'prepared_name' => $actor?->name ?? 'Automated weekly scheduler',
            'supersedes_version_id' => $latest?->id,
            'version_reason' => $latest === null ? 'initial' : 'evidence_refresh',
            'pdf_sha256' => hash('sha256', $pdfBytes),
            'pdf_bytes' => base64_encode($pdfBytes),
            'csv_sha256' => hash('sha256', $csvContent),
            'csv_content' => $csvContent,
            'renderer_version' => self::RENDERER_VERSION,
        ]);
    }

    private function renderPdf(array $report): string
    {
        $pdf = new Dompdf(new Options([
            'isRemoteEnabled' => false,
            'isPhpEnabled' => false,
            'defaultFont' => 'DejaVu Sans',
        ]));
        $pdf->loadHtml(view('reports.rssi-weekly', ['report' => $report])->render());
        $pdf->setPaper('A4');
        $pdf->render();

        return $pdf->output();
    }

    private function isCurrent(DistrictRssiReportVersion $version): bool
    {
        return ! DistrictRssiReportVersion::query()->where('district_id', $version->district_id)
            ->where('week_start', $version->week_start)->where('version', '>', $version->version)->exists()
            && hash_equals($this->hash($version->source_refs), $this->hash($this->sourceRefs($version->district_id, substr((string) $version->week_start, 0, 10))));
    }

    private function sourceRefs(int $districtId, string $weekStart, bool $lock = false): array
    {
        $start = CarbonImmutable::parse($weekStart, 'Asia/Manila')->startOfDay();

        return $this->builder->queryForDistrict($districtId, $start, $start->addWeek())
            ->when($lock, fn ($query) => $query->lockForUpdate())
            ->get()
            ->map(fn (Report $report): array => [
                'uuid' => $report->uuid,
                'version' => (int) $report->lock_version,
                'evidence_hash' => $this->hash([
                    'reference_code' => $report->reference_code,
                    'submitted_at' => $report->submitted_at?->toIso8601String(),
                    'barangay' => $report->barangay,
                    'authority_classified_condition' => $report->authority_classified_condition,
                    'reporter_suspected_condition' => $report->reporter_suspected_condition,
                    'verification_outcome' => $report->verification_outcome,
                    'affected_area_hectares' => $report->affected_area_hectares,
                    'affected_area_measurement' => $report->affectedAreaMeasurement(),
                ]),
            ])
            ->all();
    }

    private function hash(array $content): string
    {
        return hash('sha256', json_encode($this->canonical($content), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private function canonical(array $value): array
    {
        if (! array_is_list($value)) {
            ksort($value);
        }
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->canonical($item);
            }
        }

        return $value;
    }
}
