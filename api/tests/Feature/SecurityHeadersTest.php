<?php

namespace Tests\Feature;

use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    public function test_api_responses_include_baseline_security_headers_without_hsts_over_http(): void
    {
        $response = $this->getJson('/api/health');

        $response
            ->assertOk()
            ->assertHeader(
                'Content-Security-Policy',
                "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'",
            )
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            ->assertHeader(
                'Permissions-Policy',
                'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
            );

        $this->assertFalse($response->headers->has('Strict-Transport-Security'));
    }

    public function test_served_spa_shell_nonces_its_inline_theme_script_per_response(): void
    {
        $index = public_path('index.html');
        $original = is_file($index) ? file_get_contents($index) : null;
        copy(base_path('../index.html'), $index);

        try {
            $first = $this->get('/login')->assertOk();
            $second = $this->get('/login')->assertOk();

            $firstNonce = $this->themeScriptNonce($first);
            $this->assertNotSame($firstNonce, $this->themeScriptNonce($second));
        } finally {
            $original === null ? @unlink($index) : file_put_contents($index, $original);
        }
    }

    private function themeScriptNonce(TestResponse $response): string
    {
        $policy = (string) $response->headers->get('Content-Security-Policy');
        $this->assertSame(1, preg_match("/script-src 'self' 'nonce-([^']+)'/", $policy, $policyMatch));

        $html = (string) $response->getContent();
        $this->assertSame(1, preg_match('/<script nonce="([^"]+)">/', $html, $scriptMatch));
        $this->assertSame($policyMatch[1], $scriptMatch[1]);
        $this->assertStringNotContainsString('__CSP_NONCE__', $html);

        return $scriptMatch[1];
    }

    public function test_spa_shell_allows_the_maptiler_origin_and_a_same_origin_map_worker(): void
    {
        $index = public_path('index.html');
        $original = is_file($index) ? file_get_contents($index) : null;
        copy(base_path('../index.html'), $index);

        try {
            $directives = $this->policyDirectives($this->get('/')->assertOk());
        } finally {
            $original === null ? @unlink($index) : file_put_contents($index, $original);
        }

        $this->assertSame(["'self'", 'data:', 'blob:'], $directives['img-src']);
        $this->assertSame(["'self'", 'https://api.maptiler.com'], $directives['connect-src']);
        $this->assertSame(["'self'"], $directives['worker-src']);
        $this->assertSame(["'self'"], $directives['frame-src']);
        $this->assertArrayNotHasKey('child-src', $directives);
    }

    /** @return array<string, list<string>> */
    private function policyDirectives(TestResponse $response): array
    {
        $directives = [];
        foreach (explode(';', (string) $response->headers->get('Content-Security-Policy')) as $directive) {
            $parts = preg_split('/\s+/', trim($directive)) ?: [];
            if ($parts !== [] && $parts[0] !== '') {
                $directives[array_shift($parts)] = $parts;
            }
        }

        return $directives;
    }

    public function test_html_responses_use_a_nonce_for_inline_content(): void
    {
        $response = $this->get('/');
        $contentSecurityPolicy = (string) $response->headers->get('Content-Security-Policy');

        $response
            ->assertOk()
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString("script-src 'self' 'nonce-", $contentSecurityPolicy);
        $this->assertStringContainsString("style-src 'self' 'nonce-", $contentSecurityPolicy);
        $this->assertStringContainsString('<style nonce="', $response->getContent());
    }

    public function test_report_preview_allowlist_includes_the_web_origin_and_self_without_wildcards(): void
    {
        $frontendOrigin = config('caneguard.frontend_origin');
        $embedOrigins = config('caneguard.reports.embed_origins');

        $this->assertIsString($frontendOrigin);
        $this->assertContains('self', $embedOrigins);
        $this->assertContains($frontendOrigin, $embedOrigins);
        $this->assertNotContains('*', $embedOrigins);
    }

    public function test_hsts_is_only_added_when_the_request_is_https(): void
    {
        $this->get('https://localhost/up')
            ->assertOk()
            ->assertHeader(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains',
            );
    }

    public function test_untrusted_forwarded_https_does_not_enable_hsts(): void
    {
        $response = $this->withHeader('X-Forwarded-Proto', 'https')->get('/up');

        $response
            ->assertOk()
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('X-Content-Type-Options', 'nosniff');

        $this->assertFalse($response->headers->has('Strict-Transport-Security'));
    }
}
