<?php

namespace Tests\Feature;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Actions\Reports\RenderWeeklyReport;
use App\Models\DistrictGrant;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WeeklyReportPdfTest extends TestCase
{
    use RefreshDatabase;

    public function test_approval_seals_a4_pdf_bytes_signature_and_digest_without_live_rebuild(): void
    {
        $district = $this->pilotDistrict();
        $officer = User::factory()->admin()->inDistrict($district)->create(['name' => 'Synthetic Approving Officer']);
        DistrictGrant::query()->create(['user_id' => $officer->id, 'district_id' => $district->id, 'ability' => 'report:approve']);
        $report = Report::factory()->inDistrict($district)->create(['submitted_at' => '2026-09-29 10:00:00', 'farmer_or_farm_owner_name' => 'PRIVATE FARM NAME']);
        $version = app(DistrictReportWorkflow::class)->prepare($officer, '2026-W40');
        $this->travelTo(now()->setDate(2026, 10, 5)->setTime(4, 30));
        $approved = app(DistrictReportWorkflow::class)->approve($officer, $version, $version->content_hash);
        $bytes = app(RenderWeeklyReport::class)->approvedBytes($approved);
        $this->assertStringStartsWith('%PDF-', $bytes);
        $this->assertMatchesRegularExpression('/\/MediaBox\s*\[0\.000 0\.000 595\.280 841\.890\]/', $bytes);
        $this->assertSame(hash('sha256', $bytes), $approved->document_sha256);
        $this->assertArrayNotHasKey('document_bytes', $approved->toArray());
        $this->actingAs($officer, 'web');
        $path = '/api/v1/district-reports/'.$version->uuid;
        $webOrigin = 'https://web.example.test';
        config(['caneguard.reports.embed_origins' => ['self', $webOrigin]]);
        $html = $this->get($path.'/document')
            ->assertOk()
            ->assertDontSee('PRIVATE FARM NAME')
            ->assertSee('Synthetic Approving Officer')
            ->assertSee('District Mill Officer')
            ->assertSee('12:30 PM')
            ->assertSee('Static Nasugbu')
            ->assertHeaderMissing('X-Frame-Options')
            ->assertHeaderContains('Content-Security-Policy', "frame-ancestors 'self' {$webOrigin}");
        $contentSecurityPolicy = (string) $html->headers->get('Content-Security-Policy');
        $this->assertStringNotContainsString('frame-ancestors *', $contentSecurityPolicy);
        preg_match('/style-src \'self\' \'nonce-([^\']+)\'/i', $contentSecurityPolicy, $cspNonce);
        preg_match('/<style nonce="([^"]+)">/', $html->getContent(), $styleNonce);
        $this->assertNotEmpty($cspNonce[1] ?? null);
        $this->assertSame($cspNonce[1], $styleNonce[1] ?? null);
        $this->assertStringNotContainsString('Downy mildew', $html->getContent());
        $report->update(['review_notes' => 'Later correction', 'lock_version' => 1]);
        $this->travel(3)->days();
        $download = $this->get($path.'/pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf')->assertHeader('X-Document-SHA256', $approved->document_sha256);
        $this->assertSame($bytes, $download->getContent());
        $this->assertSame($bytes, $this->get($path.'/pdf')->getContent());
        $this->get($path.'/pdf?disease=smut')->assertUnprocessable();
        $this->get($path.'/document?disease=smut')->assertOk()->assertSee('Derived view: Sugarcane Smut')->assertDontSee('<td>Sugarcane Mosaic</td>', false);
        DB::table('district_report_versions')->where('id', $version->id)->update(['document_bytes' => base64_encode('corrupt')]);
        $this->get($path.'/pdf')->assertConflict();
    }

    public function test_privacy_requires_explicit_preparation_enablement_and_named_officer_access(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->reviewer()->inDistrict($district)->create();
        $officer = User::factory()->admin()->inDistrict($district)->create();
        DistrictGrant::query()->create(['user_id' => $officer->id, 'district_id' => $district->id, 'ability' => 'report:approve']);
        Report::factory()->inDistrict($district)->create(['submitted_at' => '2026-09-29 10:00:00', 'farmer_or_farm_owner_name' => 'PRIVATE APPENDIX NAME']);
        $this->actingAs($officer, 'web');
        $this->postJson('/api/v1/district-reports', ['week' => '2026-W40', 'appendix' => true])->assertForbidden();
        config(['caneguard.weekly_appendix_enabled' => true]);
        $version = $this->postJson('/api/v1/district-reports', ['week' => '2026-W40', 'appendix' => true])->assertCreated()->json('data');
        $this->assertArrayNotHasKey('content', $version);
        $path = '/api/v1/district-reports/'.$version['uuid'];
        $this->get($path.'/document')->assertOk()->assertDontSee('PRIVATE APPENDIX NAME');
        $this->get($path.'/document?appendix=1')->assertOk()->assertSee('PRIVATE APPENDIX NAME');
        $this->getJson('/api/v1/district-reports')->assertOk()->assertDontSee('PRIVATE APPENDIX NAME');
        Auth::forgetGuards();
        $this->actingAs($reviewer, 'web');
        $this->get($path.'/document?appendix=1')
            ->assertForbidden()
            ->assertDontSee('PRIVATE APPENDIX NAME');
        $this->get($path.'/pdf')->assertForbidden();
        $this->postJson('/api/v1/district-reports', ['week' => '2026-W40', 'appendix' => true])->assertForbidden();
        $inspector = User::factory()->fieldReporter()->inDistrict($district)->create();
        Auth::forgetGuards();
        $this->actingAs($inspector, 'web');
        $this->get($path.'/pdf')->assertForbidden();
    }

    public function test_approved_artifact_and_signature_cannot_be_rewritten(): void
    {
        $district = $this->pilotDistrict();
        $officer = User::factory()->admin()->inDistrict($district)->create();
        DistrictGrant::query()->create(['user_id' => $officer->id, 'district_id' => $district->id, 'ability' => 'report:approve']);
        $version = app(DistrictReportWorkflow::class)->prepare($officer, '2026-W40');
        $approved = app(DistrictReportWorkflow::class)->approve($officer, $version, $version->content_hash);
        $this->expectException(\LogicException::class);
        $approved->update(['document_sha256' => str_repeat('0', 64)]);
    }
}
