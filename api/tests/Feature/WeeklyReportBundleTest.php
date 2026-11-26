<?php

namespace Tests\Feature;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Models\DistrictReportVersion;
use App\Models\DistrictRssiReportVersion;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use ZipArchive;

class WeeklyReportBundleTest extends TestCase
{
    use RefreshDatabase;

    public function test_weekly_bundle_zip_contains_5_disease_pdf_rssi_pdf_and_rssi_csv_with_no_pii(): void
    {
        $district = $this->pilotDistrict();
        $admin = User::factory()->admin()->inDistrict($district)->create();

        Report::factory()->inDistrict($district)->create([
            'reference_code' => 'CG-BUNDLE-1',
            'submitted_at' => '2026-11-18 02:00:00',
            'barangay' => 'Banilad',
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'verified',
            'farmer_or_farm_owner_name' => 'PRIVATE BUNDLE FARMER',
        ]);

        $this->actingAs($admin, 'web');

        // 404 when no snapshots exist yet.
        $this->get('/api/v1/district-reports/weekly-bundle?week=2026-W47')->assertNotFound();

        // Generate both via cron command.
        $this->artisan('reports:generate-weekly', ['--week' => '2026-W47'])->assertSuccessful();

        // Before approval, bundle carries -draft.pdf for 5-Disease + RSSI PDF + RSSI CSV.
        $draftZip = $this->get('/api/v1/district-reports/weekly-bundle?week=2026-W47')
            ->assertOk()
            ->assertHeader('content-type', 'application/zip')
            ->assertHeader('cache-control', 'no-store, private');
        $draftNames = $this->extractZipEntries($draftZip->getContent());
        $this->assertCount(3, $draftNames);
        $this->assertTrue(collect(array_keys($draftNames))->contains(fn ($n) => str_ends_with($n, '-draft.pdf')));

        // Approve 5-Disease report; bundle now carries sealed approved PDF matching exact SHA-256.
        $fiveDisease = DistrictReportVersion::query()->sole();
        $approved = app(DistrictReportWorkflow::class)->approve($admin, $fiveDisease, $fiveDisease->content_hash)->fresh();
        $rssi = DistrictRssiReportVersion::query()->sole();

        $approvedZip = $this->get('/api/v1/district-reports/weekly-bundle?week=2026-W47')->assertOk();
        $entries = $this->extractZipEntries($approvedZip->getContent());
        $this->assertCount(3, $entries);

        $names = array_keys($entries);
        $fiveName = collect($names)->first(fn ($n) => str_contains($n, 'caneguard-weekly-') && str_ends_with($n, '.pdf') && ! str_ends_with($n, '-draft.pdf'));
        $rssiPdfName = collect($names)->first(fn ($n) => str_contains($n, 'caneguard-rssi-weekly-') && str_ends_with($n, '.pdf'));
        $rssiCsvName = collect($names)->first(fn ($n) => str_contains($n, 'caneguard-rssi-weekly-') && str_ends_with($n, '.csv'));

        $this->assertNotNull($fiveName);
        $this->assertNotNull($rssiPdfName);
        $this->assertNotNull($rssiCsvName);
        $this->assertSame($approved->document_sha256, hash('sha256', $entries[$fiveName]));
        $this->assertSame($rssi->pdf_sha256, hash('sha256', $entries[$rssiPdfName]));
        $this->assertSame($rssi->csv_sha256, hash('sha256', $entries[$rssiCsvName]));
        $this->assertStringNotContainsString('PRIVATE BUNDLE FARMER', $entries[$rssiCsvName]);
    }

    /**
     * @return array<string, string>
     */
    private function extractZipEntries(string $zipBytes): array
    {
        $path = tempnam(sys_get_temp_dir(), 'test-bundle-');
        file_put_contents($path, $zipBytes);
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path) === true);
        $entries = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string) $zip->getNameIndex($i);
            $entries[$name] = (string) $zip->getFromIndex($i);
        }
        $zip->close();
        @unlink($path);

        return $entries;
    }
}
