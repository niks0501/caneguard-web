<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class ProductionResponsePolicyTest extends TestCase
{
    public function test_real_spa_file_response_allows_only_same_origin_previews_and_workers(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config(['app.url' => 'https://caneguard.example.test', 'app.trusted_hosts' => ['caneguard.example.test']]);
        $public = sys_get_temp_dir().'/caneguard-public-'.bin2hex(random_bytes(6));
        mkdir($public);
        file_put_contents($public.'/index.html', '<!doctype html><script type="module" src="/assets/index.js"></script>');
        $old = public_path();
        $this->app->usePublicPath($public);
        try {
            $response = $this->get('https://caneguard.example.test/reports')->assertOk();
            $policy = $response->headers->get('Content-Security-Policy');
            $this->assertStringContainsString("frame-src 'self'", $policy);
            $this->assertStringContainsString("worker-src 'self'", $policy);
            $this->assertStringContainsString("script-src 'self' 'nonce-", $policy);
            $this->assertStringContainsString("connect-src 'self'", $policy);
            $this->assertStringNotContainsString('unsafe-inline', $policy);
            $this->assertStringNotContainsString('blob:', $policy);
            $response->assertHeader('X-Frame-Options', 'DENY')
                ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        } finally {
            $this->app->usePublicPath($old);
            unlink($public.'/index.html');
            rmdir($public);
        }
    }

    public function test_weekly_style_uses_the_response_nonce_and_document_cannot_create_frames(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        $template = file_get_contents(resource_path('views/reports/weekly-document.blade.php'));
        preg_match('/<style[^\n]*>/', $template, $style);
        Route::get('/api/policy-test-document', fn () => response(Blade::render($style[0].'</style>')))
            ->name('api.v1.reports.documents.district-version');
        $response = $this->get('/api/policy-test-document')->assertOk();
        preg_match("/style-src 'self' 'nonce-([^']+)'/", $response->headers->get('Content-Security-Policy'), $nonce);
        $this->assertNotEmpty($nonce[1]);
        $response->assertSee('nonce="'.$nonce[1].'"', false)->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $this->assertStringContainsString("frame-ancestors 'self'", $response->headers->get('Content-Security-Policy'));
        $this->assertStringContainsString("frame-src 'none'", $response->headers->get('Content-Security-Policy'));
        $this->assertFalse($response->headers->has('Strict-Transport-Security'));
    }

    public function test_json_and_other_api_html_keep_deny_by_default_policy(): void
    {
        Route::get('/api/policy-test-json', fn () => response()->json(['ok' => true]));
        Route::get('/api/policy-test-html', fn () => response('<p>Error</p>'));
        $this->getJson('/api/policy-test-json')->assertOk()
            ->assertHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'")
            ->assertHeader('X-Frame-Options', 'DENY');
        $response = $this->get('/api/policy-test-html')->assertOk()->assertHeader('X-Frame-Options', 'DENY');
        $this->assertStringContainsString("frame-src 'none'", $response->headers->get('Content-Security-Policy'));
    }
}
