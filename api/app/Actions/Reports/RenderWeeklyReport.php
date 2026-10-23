<?php

namespace App\Actions\Reports;

use App\Models\DistrictReportVersion;
use Dompdf\Dompdf;
use Dompdf\Options;

/** Approval seals bytes once. Reads and sends never query live field reports. */
final class RenderWeeklyReport
{
    public const VERSION = 'weekly-letterhead-v1';

    public function __construct(private readonly WeeklyReportGraphics $graphics) {}

    public function data(DistrictReportVersion $version, ?string $disease = null, bool $appendix = false): array
    {
        abort_unless(($version->content['contract'] ?? null) === 'weekly-report-content-v1', 409, 'Prepare an official weekly version first.');
        abort_unless(hash_equals($version->content['map']['asset_digest'], $this->graphics->assetDigest()), 409, 'The report renderer assets changed. Prepare a new version.');
        $content = $version->content;
        if (! $appendix) {
            $content['appendix'] = [];
        }

        return [
            'content' => $content, 'version' => $version, 'disease' => $disease,
            'charts' => $this->graphics->charts($content, $disease), 'map' => $this->graphics->map($content),
            'logo' => 'data:image/svg+xml;base64,'.base64_encode(file_get_contents(base_path('../brand/CaneGuard_logo_flat.svg'))),
            'web_origin' => ReportEmbedOrigin::resolve(),
        ];
    }

    public function pdf(DistrictReportVersion $version): string
    {
        $pdf = new Dompdf(new Options(['isRemoteEnabled' => false, 'isPhpEnabled' => false, 'defaultFont' => 'DejaVu Sans']));
        $pdf->loadHtml(view('reports.weekly-document', $this->data($version, null, $version->content['appendix_enabled']))->render());
        $pdf->setPaper('A4');
        $pdf->render();
        $pdf->getCanvas()->page_text(42, 812, 'CaneGuard · Operational counts, not population statistics · Page {PAGE_NUM} of {PAGE_COUNT}', null, 8, [0.12, 0.27, 0.16]);

        return $pdf->output();
    }

    public function approvedBytes(DistrictReportVersion $version): string
    {
        $bytes = base64_decode((string) $version->document_bytes, true);
        abort_unless($version->approved_at !== null && $bytes !== false && $bytes !== ''
            && hash_equals((string) $version->document_sha256, hash('sha256', $bytes)), 409, 'The approved PDF could not be verified.');

        return $bytes;
    }

    public function filename(DistrictReportVersion $version): string
    {
        $district = preg_replace('/[^A-Za-z0-9_-]/', '-', $version->content['district']['code']);

        return 'caneguard-weekly-'.$district.'-'.$version->content['period']['week'].'-v'.$version->version.'.pdf';
    }
}
