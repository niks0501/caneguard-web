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
        $isEmbeddableReport = $isHtml && $isReportDocument;
        $embedOrigins = array_values(array_filter(
            config('caneguard.reports.embed_origins', ['self']),
            'is_string',
        ));
        if ($isEmbeddableReport) {
            // The signed template is shared with PDF rendering. Nonce the HTTP
            // preview response only so existing report digests stay stable.
            $content = $response->getContent();
            if (is_string($content)) {
                $noncedContent = preg_replace_callback(
                    '/<style\\b([^>]*)>/i',
                    static function (array $matches) use ($nonce): string {
                        return preg_match('/(?:^|\\s)nonce\\s*=/i', $matches[1]) === 1
                            ? $matches[0]
                            : '<style'.$matches[1].' nonce="'.$nonce.'">';
                    },
                    $content,
                );
                if (is_string($noncedContent)) {
                    $response->setContent($noncedContent);
                }
            }
        }
        $allowsCrossOriginFrame = $isEmbeddableReport && array_filter(
            $embedOrigins,
            static fn (string $origin): bool => $origin !== 'self',
        ) !== [];
        $frameAncestors = $isEmbeddableReport && $embedOrigins !== []
            ? implode(' ', array_map(
                static fn (string $origin): string => $origin === 'self' ? "'self'" : $origin,
                $embedOrigins,
            ))
            : "'none'";

        $response->headers->set(
            'Content-Security-Policy',
            $isHtml
                ? "default-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors {$frameAncestors}; object-src 'none'; img-src 'self' data:; style-src 'self' 'nonce-{$nonce}'; script-src 'self' 'nonce-{$nonce}'; font-src 'self'; connect-src 'self'"
                : "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'",
        );
        if ($allowsCrossOriginFrame) {
            // CSP carries the exact web-origin allowlist; SAMEORIGIN would reject
            // a permitted cross-origin frontend before CSP can take effect.
            $response->headers->remove('X-Frame-Options');
        } else {
            $response->headers->set('X-Frame-Options', $isReportDocument ? 'SAMEORIGIN' : 'DENY');
        }
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
