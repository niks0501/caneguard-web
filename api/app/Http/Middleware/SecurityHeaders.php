<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->attributes->set('csp_nonce', base64_encode(random_bytes(16)));

        return self::apply($request, $next($request));
    }

    public static function apply(Request $request, Response $response): Response
    {
        $contentType = strtolower((string) $response->headers->get('Content-Type', ''));
        $isHtml = str_contains($contentType, 'text/html');
        $nonce = (string) $request->attributes->get('csp_nonce');

        if ($isHtml && $nonce === '') {
            $nonce = base64_encode(random_bytes(16));
            $request->attributes->set('csp_nonce', $nonce);
        }

        $isReportDocument = $request->routeIs('api.v1.reports.documents*');
        $frameAncestors = $isReportDocument
            ? implode(' ', array_map(
                static fn (string $origin): string => $origin === 'self' ? "'self'" : $origin,
                config('caneguard.reports.embed_origins', ['self']),
            ))
            : "'none'";

        // Only the SPA may load same-origin preview frames. Document/API
        // responses remain unable to create child frames.
        $isSpa = $isHtml && ! $isReportDocument && ! $request->is('api/*');
        $frameSrc = $isSpa ? "'self'" : "'none'";

        $response->headers->set(
            'Content-Security-Policy',
            $isHtml
                ? "default-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors {$frameAncestors}; object-src 'none'; img-src 'self' data:; style-src 'self' 'nonce-{$nonce}'; script-src 'self' 'nonce-{$nonce}'; font-src 'self'; connect-src 'self'; frame-src {$frameSrc}; worker-src 'self'"
                : "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'",
        );
        $response->headers->set('X-Frame-Options', $isReportDocument ? 'SAMEORIGIN' : 'DENY');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set(
            'Permissions-Policy',
            'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        );

        if ($request->is('api/v2/admin/accounts*')) {
            $response->headers->set('Cache-Control', 'private, no-store');
        }

        // Only advertise HSTS when Laravel knows this request used HTTPS. An
        // HTTP local/dev request must not accidentally opt a host into HSTS.
        if ($request->isSecure()) {
            $response->headers->set(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains',
            );
        }

        return $response;
    }
}
