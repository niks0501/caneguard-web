<?php

namespace Tests\Feature;

use App\Actions\Reports\BuildReportDocument;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\LaravelPdf\Facades\Pdf;
use Spatie\LaravelPdf\PdfBuilder;
use Tests\TestCase;

class ReportDocumentTest extends TestCase
{
    use RefreshDatabase;

    public function test_document_uses_pht_week_boundaries_and_hides_appendix_by_default(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-PHT-IN',
            'farmer_or_farm_owner_name' => 'PHT farmer reference',
            'submitted_at' => CarbonImmutable::parse('2026-09-20T15:30:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-PHT-OUT',
            'submitted_at' => CarbonImmutable::parse('2026-09-20T16:30:00Z'),
        ]);

        Sanctum::actingAs($reviewer);
        $webOrigin = 'https://web.example.test';
        config(['caneguard.reports.embed_origins' => ['self', $webOrigin]]);
        $response = $this->get('/api/v1/reports/documents/report?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W38',
        ]));

        $response->assertOk()
            ->assertHeader('Content-Type', 'text/html; charset=UTF-8')
            ->assertHeaderMissing('X-Frame-Options')
            ->assertHeaderContains('Content-Security-Policy', "frame-ancestors 'self' {$webOrigin}");
        $this->assertStringNotContainsString(
            'frame-ancestors *',
            (string) $response->headers->get('Content-Security-Policy'),
        );
        $document = app(BuildReportDocument::class)->handle([
            'period_type' => 'weekly',
            'week' => '2026-W38',
        ]);
        $this->assertSame(1, $document['metrics']['reported_cases']);
        $this->assertSame(1, $document['metrics']['reports_containing_farmer_farm_information']);
        $response->assertSee('Week 38')
            ->assertSee('PHT (UTC+8)')
            ->assertSee('Operational summary')
            ->assertSee('Submitted reports')
            ->assertSee('Estimated affected area')
            ->assertSee('Reports with farmer/farm information')
            ->assertSee('Reports requiring field validation')
            ->assertSee('Open submitted reports')
            ->assertSee('Closed submitted reports')
            ->assertSee('By barangay')
            ->assertSee('Field-validation workload')
            ->assertSee('Operational queue status')
            ->assertSee('Follow-up Due')
            ->assertSee('Upcoming Visits')
            ->assertSee('By Possible Condition')
            ->assertSee('not an estimate of total affected farmers in Nasugbu')
            ->assertSee('Supplementary trend and review information')
            ->assertDontSee('Expert consultation')
            ->assertDontSee('accuracy')
            ->assertDontSee('PHT farmer reference')
            ->assertDontSee('CG-PHT-IN')
            ->assertDontSee('CG-PHT-OUT');
    }

    public function test_document_renders_when_the_embed_allowlist_has_no_configured_origin(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-SELF-ONLY',
            'submitted_at' => CarbonImmutable::parse('2026-09-20T15:30:00Z'),
        ]);
        Sanctum::actingAs($reviewer);
        config(['caneguard.reports.embed_origins' => ['self']]);

        $response = $this->get('/api/v1/reports/documents/report?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W38',
        ]));

        $response->assertOk()
            ->assertHeaderContains('Content-Security-Policy', "frame-ancestors 'self'")
            ->assertSee('Operational summary');
    }

    public function test_the_document_channel_follows_the_embedding_parent_inside_the_allowlist(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MULTI-ORIGIN',
            'submitted_at' => CarbonImmutable::parse('2026-09-20T15:30:00Z'),
        ]);
        Sanctum::actingAs($reviewer);
        config(['caneguard.reports.embed_origins' => ['self', 'https://a.example', 'https://b.example']]);
        $path = '/api/v1/reports/documents/report?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W38',
        ]);

        $this->withHeaders(['Referer' => 'https://b.example/cases/1'])->get($path)->assertOk();
        $this->assertSame('https://b.example', $this->documentPayload()['web_origin']);

        $this->withHeaders(['Referer' => 'http://localhost/cases/1'])->get($path)->assertOk();
        $this->assertSame('self', $this->documentPayload()['web_origin']);

        $this->withHeaders(['Referer' => 'https://attacker.test/cases/1'])->get($path)->assertOk();
        $this->assertSame('https://a.example', $this->documentPayload()['web_origin']);
    }

    /** @return array<string, mixed> */
    private function documentPayload(): array
    {
        return app(BuildReportDocument::class)->handle([
            'period_type' => 'weekly',
            'week' => '2026-W38',
        ]);
    }

    public function test_appendix_is_explicit_and_warns_about_farmer_references(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-APPENDIX',
            'farmer_or_farm_owner_name' => 'Farmer reference',
            'submitted_at' => CarbonImmutable::parse('2026-09-20T15:30:00Z'),
        ]);

        Sanctum::actingAs($reviewer);
        $response = $this->get('/api/v1/reports/documents/report?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W38',
            'appendix' => 1,
        ]));

        $response->assertOk()
            ->assertSee('Farmer and farm references are included')
            ->assertSee('Farmer reference')
            ->assertSee('Case register appendix');
    }

    public function test_pdf_route_returns_a_rendered_document_for_seeded_reports(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-PDF-SEEDED',
            'submitted_at' => CarbonImmutable::parse('2026-09-17T08:00:00Z'),
        ]);
        Sanctum::actingAs($reviewer);
        $fakePdf = Pdf::fake();

        $response = $this->get('/api/v1/reports/documents/report/pdf?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W38',
        ]));

        $response->assertOk();
        $fakePdf->assertRespondedWithPdf(
            static fn (PdfBuilder $pdf): bool => $pdf->viewName === 'reports.document'
                && ($pdf->viewData['metrics']['reported_cases'] ?? null) === 1,
        );
    }

    public function test_pdf_route_generates_a_valid_dompdf_document_without_a_browser_driver(): void
    {
        $this->assertSame('dompdf', config('laravel-pdf.driver'));
        $this->assertSame(public_path(), config('laravel-pdf.dompdf.chroot'));

        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-PDF-DOMPDF',
            'submitted_at' => CarbonImmutable::parse('2026-09-17T08:00:00Z'),
        ]);
        Sanctum::actingAs($reviewer);

        $response = $this->get('/api/v1/reports/documents/report/pdf?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W38',
        ]));

        $response->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeaderContains('Content-Disposition', 'attachment; filename="caneguard-report-');

        $pdf = $response->getContent();
        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertStringEndsWith('%%EOF', trim($pdf));

        preg_match_all('/\\/Type\\s*\\/Page\\b/', $pdf, $pageObjects);
        $pageCount = count($pageObjects[0]);
        $this->assertGreaterThan(1, $pageCount);
        $pageTreePattern = '/\\/Type\\s*\\/Pages\\b.*?\\/Count\\s+'.$pageCount.'\\b/s';
        $this->assertSame(1, preg_match($pageTreePattern, $pdf));

        $pdfText = $this->decodePdfTextStreams($pdf);
        $this->assertStringContainsString('OPERATIONAL SUMMARY', $pdfText);
        $this->assertStringContainsString('FIELD-VALIDATION WORKLOAD', $pdfText);

        $formatResponse = $this->get('/api/v1/reports/documents/report?'.http_build_query([
            'period_type' => 'weekly',
            'week' => '2026-W38',
            'format' => 'pdf',
        ]));

        $formatResponse->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $formatResponse->getContent());
    }

    private function decodePdfTextStreams(string $pdf): string
    {
        preg_match_all('/stream\\r?\\n(.*?)\\r?\\nendstream/s', $pdf, $matches);

        return implode("\n", array_map(
            static fn (string $stream): string => @gzuncompress($stream) ?: $stream,
            $matches[1],
        ));
    }

    public function test_other_html_routes_still_deny_framing(): void
    {
        $response = $this->get('/');

        $response->assertOk()
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeaderContains('Content-Security-Policy', "frame-ancestors 'none'");
    }
}
