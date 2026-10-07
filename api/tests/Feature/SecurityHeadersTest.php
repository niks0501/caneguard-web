<?php

namespace Tests\Feature;

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
