<?php

namespace App\Actions\Reports;

use App\Models\DistrictReportVersion;
use App\Models\DistrictRssiReportVersion;
use ZipArchive;

/**
 * Packages the week's 5-Disease PDF + Weekly RSSI PDF + Weekly RSSI CSV
 * into a single ZIP file ready to attach in Gmail for main-office hand-off.
 */
final class BuildWeeklyReportBundle
{
    public function __construct(
        private readonly RenderWeeklyReport $weeklyRenderer,
        private readonly DistrictRssiReportWorkflow $rssiWorkflow,
    ) {}

    /**
     * @return array{bytes:string,filename:string,sha256:string,files:array<int,string>}
     */
    public function handle(
        string $week,
        string $districtCode,
        ?DistrictReportVersion $fiveDisease,
        ?DistrictRssiReportVersion $rssi,
    ): array {
        abort_if($fiveDisease === null && $rssi === null, 404, 'No weekly report snapshots exist for this week yet.');
        abort_unless(class_exists(ZipArchive::class), 503, 'ZIP archiving is unavailable on this server.');

        $tmpPath = tempnam(sys_get_temp_dir(), 'caneguard-bundle-');
        abort_if($tmpPath === false, 500, 'Could not allocate temporary bundle file.');

        $zip = new ZipArchive;
        $files = [];
        try {
            abort_unless($zip->open($tmpPath, ZipArchive::OVERWRITE | ZipArchive::CREATE) === true, 500, 'Could not create weekly bundle archive.');

            if ($fiveDisease !== null) {
                $pdfBytes = $fiveDisease->approved_at !== null
                    ? $this->weeklyRenderer->approvedBytes($fiveDisease)
                    : $this->weeklyRenderer->pdf($fiveDisease);
                $baseName = $this->weeklyRenderer->filename($fiveDisease);
                $entryName = $fiveDisease->approved_at !== null
                    ? $baseName
                    : preg_replace('/\.pdf$/', '-draft.pdf', $baseName);
                $zip->addFromString((string) $entryName, $pdfBytes);
                $files[] = (string) $entryName;
            }

            if ($rssi !== null) {
                $rssiPdfName = $this->rssiWorkflow->filename($rssi, 'pdf');
                $rssiCsvName = $this->rssiWorkflow->filename($rssi, 'csv');
                $zip->addFromString($rssiPdfName, $this->rssiWorkflow->pdfBytes($rssi));
                $zip->addFromString($rssiCsvName, $this->rssiWorkflow->csvContent($rssi));
                $files[] = $rssiPdfName;
                $files[] = $rssiCsvName;
            }

            $zip->close();
            $bytes = file_get_contents($tmpPath);
            abort_if($bytes === false || $bytes === '', 500, 'Could not read generated weekly bundle archive.');
        } finally {
            if (file_exists($tmpPath)) {
                @unlink($tmpPath);
            }
        }

        $safeDistrict = preg_replace('/[^A-Za-z0-9_-]/', '-', $districtCode) ?: 'district';

        return [
            'bytes' => $bytes,
            'filename' => "caneguard-weekly-bundle-{$safeDistrict}-{$week}.zip",
            'sha256' => hash('sha256', $bytes),
            'files' => $files,
        ];
    }
}
