<?php

use Spatie\LaravelPdf\Caching\DefaultPdfCache;
use Spatie\LaravelPdf\Encryption\DefaultPdfEncrypter;
use Spatie\LaravelPdf\Jobs\GeneratePdfJob;

return [
    /*
     * Use DomPDF for server-side PDF generation. It is a pure PHP renderer and
     * does not require a browser binary on the API host.
     */
    'driver' => 'dompdf',

    /*
     * Render caching. When you call `->cache()` on a PDF, the generated
     * content is stored so identical renders are served from the cache.
     *
     * Swap `class` for your own implementation of the PdfCache contract
     * to fully customize how PDFs are keyed, stored, and expired.
     */
    'cache' => [
        'class' => DefaultPdfCache::class,
        'automatic' => env('LARAVEL_PDF_CACHE_AUTOMATIC', false),
        'store' => env('LARAVEL_PDF_CACHE_STORE'),
        'prefix' => 'laravel-pdf',
        'ttl' => env('LARAVEL_PDF_CACHE_TTL', 60 * 60 * 24),
    ],

    /*
     * Pure PHP PDF generation — no external binaries required.
     * Requires the dompdf/dompdf package.
     */
    'dompdf' => [
        'is_remote_enabled' => env('LARAVEL_PDF_DOMPDF_REMOTE_ENABLED', false),
        'chroot' => env('LARAVEL_PDF_DOMPDF_CHROOT', public_path()),
    ],

    'job' => GeneratePdfJob::class,
    'encrypter' => DefaultPdfEncrypter::class,
];
