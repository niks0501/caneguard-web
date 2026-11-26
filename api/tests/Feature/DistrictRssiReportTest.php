<?php

namespace Tests\Feature;

use App\Models\DistrictRssiReportVersion;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DistrictRssiReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_rssi_snapshot_separates_validated_and_suspected_strips_pii_and_supports_preview_pdf_and_csv(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->reviewer()->inDistrict($district)->create();

        $validated = Report::factory()->inDistrict($district)->create([
            'reference_code' => 'CG-RSSI-VAL',
            'submitted_at' => '2026-11-18 02:00:00',
            'barangay' => 'Banilad',
            'authority_classified_condition' => 'rssi',
            'verification_outcome' => 'verified',
            'affected_area_hectares' => 2.25,
            'farmer_or_farm_owner_name' => 'SECRET VALIDATED FARMER',
        ]);
        Report::factory()->inDistrict($district)->create([
            'reference_code' => 'CG-RSSI-SUSP',
            'submitted_at' => '2026-11-19 02:00:00',
            'barangay' => 'Bucana',
            'predicted_label' => 'unknown',
            'reporter_suspected_condition' => 'RSSI',
            'farmer_or_farm_owner_name' => 'SECRET SUSPECTED FARMER',
        ]);

        $this->actingAs($reviewer, 'web');
        $created = $this->postJson('/api/v1/district-rssi-reports', ['week' => '2026-W47'])
            ->assertCreated()
            ->assertJsonPath('data.version', 1)
            ->assertJsonPath('data.prepared_source', 'manual')
            ->json('data');

        $list = $this->getJson('/api/v1/district-rssi-reports?week=2026-W47')
            ->assertOk()
            ->assertJsonPath('data.0.headline.validated', 1)
            ->assertJsonPath('data.0.headline.suspected', 1)
            ->assertJsonPath('data.0.is_current', true)
            ->assertJsonPath('data.0.stale_reason', null);
        $this->assertStringNotContainsString('SECRET VALIDATED FARMER', $list->getContent());
        $this->assertStringNotContainsString('SECRET SUSPECTED FARMER', $list->getContent());

        // R-01: Inline HTML preview renders cleanly with embeddable CSP and zero PII.
        $preview = $this->get('/api/v1/district-rssi-reports/'.$created['uuid'].'/document')
            ->assertOk()
            ->assertHeader('cache-control', 'no-store, private');
        $preview->assertSee('CG-RSSI-VAL');
        $preview->assertSee('CG-RSSI-SUSP');
        $preview->assertDontSee('SECRET VALIDATED FARMER');
        $preview->assertDontSee('SECRET SUSPECTED FARMER');
        $this->assertStringContainsString('frame-ancestors', (string) $preview->headers->get('Content-Security-Policy'));

        // Persisted PDF download.
        $pdf = $this->get('/api/v1/district-rssi-reports/'.$created['uuid'].'/pdf')
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf')
            ->assertHeader('x-document-sha256', $created['pdf_sha256']);
        $this->assertStringStartsWith('%PDF-', $pdf->getContent());

        // Persisted CSV download.
        $csv = $this->get('/api/v1/district-rssi-reports/'.$created['uuid'].'/csv')
            ->assertOk()
            ->assertHeader('x-document-sha256', $created['csv_sha256']);
        $this->assertStringContainsString('CG-RSSI-VAL', $csv->getContent());
        $this->assertStringNotContainsString('SECRET VALIDATED FARMER', $csv->getContent());

        // Staleness detection + manual v2 refresh.
        $validated->update(['affected_area_hectares' => 3.50, 'lock_version' => 1]);
        $this->getJson('/api/v1/district-rssi-reports?week=2026-W47')
            ->assertOk()
            ->assertJsonPath('data.0.is_current', false)
            ->assertJsonPath('data.0.stale_reason', 'evidence_changed');

        $v2 = $this->postJson('/api/v1/district-rssi-reports', ['week' => '2026-W47'])
            ->assertCreated()
            ->assertJsonPath('data.version', 2)
            ->json('data');
        $this->assertNotSame($created['uuid'], $v2['uuid']);

        // Immutability guard.
        $this->expectException(\LogicException::class);
        DistrictRssiReportVersion::query()->where('uuid', $v2['uuid'])->sole()->update(['version_reason' => 'tampered']);
    }
}
