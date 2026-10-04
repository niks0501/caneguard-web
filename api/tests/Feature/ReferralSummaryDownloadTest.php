<?php

namespace Tests\Feature;

use App\Contracts\MobileReportUploadContract;
use App\Models\Report;
use App\Models\ReportReferral;
use App\Models\User;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ReferralSummaryDownloadTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('photoFormatsAndSummaryRoutes')]
    public function test_only_html_downloads_embed_the_private_evidence_photo(
        string $extension,
        string $mimeType,
        string $summaryPath,
    ): void {
        Storage::fake('local');
        $photo = UploadedFile::fake()->image('evidence.'.$extension)->get();
        $report = Report::factory()->create([
            'image_path' => 'reports/private-evidence.'.$extension,
            'image_mime_type' => $mimeType,
            'image_size_bytes' => strlen($photo),
        ]);
        ReportReferral::factory()->for($report)->create();
        Storage::disk('local')->put($report->image_path, $photo);
        Sanctum::actingAs(User::factory()->reviewer()->create());

        $summaryUrl = "/api/v1/reports/{$report->uuid}/{$summaryPath}";
        $imageUrl = route('api.v1.reports.image', ['report' => $report->uuid], false);
        $filename = $report->reference_code.'-referral-summary.html';

        foreach (['', '?download=0'] as $query) {
            $this->get($summaryUrl.$query)
                ->assertOk()
                ->assertHeader('Content-Disposition', 'inline; filename="'.$filename.'"')
                ->assertSee('src="'.$imageUrl.'"', false)
                ->assertDontSee('data:'.$mimeType.';base64,', false);
        }

        $this->getJson($summaryUrl.'?download=1')
            ->assertOk()
            ->assertJsonPath('data.primary_evidence.available', true)
            ->assertJsonPath('data.primary_evidence.url', $imageUrl);

        $download = $this->get($summaryUrl.'?download=1')
            ->assertOk()
            ->assertHeader('Content-Type', 'text/html; charset=UTF-8')
            ->assertHeader('Content-Disposition', 'attachment; filename="'.$filename.'"')
            ->assertSee('src="data:'.$mimeType.';base64,', false)
            ->assertDontSee($imageUrl, false);

        $this->assertSame(1, preg_match(
            '/src="data:([^;]+);base64,([^"]+)"/',
            $download->getContent(),
            $matches,
        ));
        $this->assertSame($mimeType, $matches[1]);
        $this->assertSame($photo, base64_decode($matches[2], true));
    }

    public static function photoFormatsAndSummaryRoutes(): array
    {
        $cases = [];
        foreach (self::summaryRoutes() as [$summaryPath]) {
            foreach (['jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'] as $extension => $mimeType) {
                $cases[$summaryPath.' '.$extension] = [$extension, $mimeType, $summaryPath];
            }
        }

        return $cases;
    }

    #[DataProvider('summaryRoutes')]
    public function test_missing_evidence_keeps_the_notice_for_inline_and_download_output(string $summaryPath): void
    {
        Storage::fake('local');
        $report = ReportReferral::factory()->create()->report;
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $summaryUrl = "/api/v1/reports/{$report->uuid}/{$summaryPath}";

        foreach (['', '?download=1'] as $query) {
            $this->get($summaryUrl.$query)
                ->assertOk()
                ->assertSee('The primary image is not available in the current private evidence store.')
                ->assertDontSee('<img', false)
                ->assertDontSee('base64,', false);
        }

        $this->getJson($summaryUrl.'?download=1')
            ->assertOk()
            ->assertJsonPath('data.primary_evidence.available', false);
    }

    #[DataProvider('summaryRoutes')]
    public function test_download_denials_do_not_access_private_evidence(string $summaryPath): void
    {
        $report = ReportReferral::factory()->create()->report;
        $summaryUrl = "/api/v1/reports/{$report->uuid}/{$summaryPath}?download=1";
        Storage::shouldReceive('disk')->never();

        $this->get($summaryUrl)
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED')
            ->assertDontSee('base64,', false);

        foreach ([
            User::factory()->fieldReporter()->create(),
            User::factory()->create(['role' => 'expert']),
        ] as $unauthorizedUser) {
            Sanctum::actingAs($unauthorizedUser);
            $this->get($summaryUrl)
                ->assertForbidden()
                ->assertJsonPath('code', 'FORBIDDEN')
                ->assertDontSee('base64,', false);
        }

    }

    public function test_download_keeps_the_missing_evidence_notice_when_the_photo_cannot_be_read(): void
    {
        $report = ReportReferral::factory()->create()->report;
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $disk = Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('exists')->with($report->image_path)->once()->andReturn(true);
        $disk->shouldReceive('readStream')->with($report->image_path)->once()->andReturn(null);
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $this->get("/api/v1/reports/{$report->uuid}/referral/summary?download=1")
            ->assertOk()
            ->assertSee('The primary image is not available in the current private evidence store.')
            ->assertDontSee('<img', false)
            ->assertDontSee('base64,', false);
    }

    public function test_download_embeds_evidence_at_the_documented_size_ceiling(): void
    {
        Storage::fake('local');
        $maxBytes = MobileReportUploadContract::field('image')['max_bytes'];
        $photo = str_pad(UploadedFile::fake()->image('evidence.jpeg')->get(), $maxBytes, "\0");
        $report = ReportReferral::factory()->create()->report;
        Storage::disk('local')->put($report->image_path, $photo);
        Sanctum::actingAs(User::factory()->reviewer()->create());

        $download = $this->get("/api/v1/reports/{$report->uuid}/referral/summary?download=1")
            ->assertOk();

        $this->assertSame(1, preg_match(
            '/src="data:image\/jpeg;base64,([^"]+)"/',
            $download->getContent(),
            $matches,
        ));
        $decoded = base64_decode($matches[1], true);
        $this->assertIsString($decoded);
        $this->assertSame($maxBytes, strlen($decoded));
        $this->assertSame(hash('sha256', $photo), hash('sha256', $decoded));
    }

    public function test_download_does_not_embed_a_private_file_above_the_size_ceiling(): void
    {
        Storage::fake('local');
        $report = Report::factory()->create(['image_size_bytes' => 1]);
        ReportReferral::factory()->for($report)->create();
        Storage::disk('local')->put(
            $report->image_path,
            str_repeat('x', MobileReportUploadContract::field('image')['max_bytes'] + 1),
        );
        Sanctum::actingAs(User::factory()->reviewer()->create());
        $summaryUrl = "/api/v1/reports/{$report->uuid}/referral/summary";

        $this->get($summaryUrl.'?download=1')
            ->assertOk()
            ->assertSee('The primary image is not available in the current private evidence store.')
            ->assertDontSee('<img', false)
            ->assertDontSee('base64,', false);

        $this->get($summaryUrl)
            ->assertOk()
            ->assertSee('src="'.route('api.v1.reports.image', ['report' => $report->uuid], false).'"', false);
    }

    public static function summaryRoutes(): array
    {
        return [
            'canonical' => ['referral/summary'],
            'alias' => ['referral-summary'],
        ];
    }
}
