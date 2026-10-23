<?php

namespace App\Actions\Reports;

/**
 * The one Web origin an embedded report document may talk to. Never a
 * wildcard: the configured allowlist decides, and `self` falls back to the
 * document's own origin.
 */
final class ReportEmbedOrigin
{
    public static function resolve(): string
    {
        foreach ((array) config('caneguard.reports.embed_origins', ['self']) as $origin) {
            if (is_string($origin) && $origin !== '' && $origin !== 'self') {
                return rtrim($origin, '/');
            }
        }

        return 'self';
    }
}
