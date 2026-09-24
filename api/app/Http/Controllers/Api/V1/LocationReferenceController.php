<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class LocationReferenceController extends Controller
{
    private const VERSION = '2026-08-13T00:00:00.000Z';

    private const ETAG = '"locations-2026-08-13"';

    /** @var list<string> */
    private const BARANGAYS = [
        'Aga',
        'Balaytigui',
        'Banilad',
        'Barangay 1 (Poblacion)',
        'Barangay 10 (Poblacion)',
        'Barangay 11 (Poblacion)',
        'Barangay 12 (Poblacion)',
        'Barangay 2 (Poblacion)',
        'Barangay 3 (Poblacion)',
        'Barangay 4 (Poblacion)',
        'Barangay 5 (Poblacion)',
        'Barangay 6 (Poblacion)',
        'Barangay 7 (Poblacion)',
        'Barangay 8 (Poblacion)',
        'Barangay 9 (Poblacion)',
        'Bilaran',
        'Bucana',
        'Bulihan',
        'Bunducan',
        'Butucan',
        'Calayo',
        'Catandaan',
        'Cogunan',
        'Dayap',
        'Kaylaway',
        'Kayrilaw',
        'Latag',
        'Looc',
        'Lumbangan',
        'Malapad na Bato',
        'Mataas na Pulo',
        'Maugat',
        'Munting Indan',
        'Natipuan',
        'Pantalan',
        'Papaya',
        'Putat',
        'Reparo',
        'Talangan',
        'Tumalim',
        'Utod',
        'Wawa',
    ];

    /** Nasugbu scope shared with the dashboard analytics aggregates. */
    public const SCOPE_MUNICIPALITY = 'Nasugbu';

    public const SCOPE_PROVINCE = 'Batangas';

    /** @return list<string> */
    public static function barangayScope(): array
    {
        return self::BARANGAYS;
    }

    public function __invoke(Request $request): JsonResponse|Response
    {
        $headers = ['ETag' => self::ETAG];

        if ($this->matchesCurrentEtag($request->header('If-None-Match'))) {
            return response()->noContent(304, $headers);
        }

        return response()->json([
            'version' => self::VERSION,
            'etag' => self::ETAG,
            'regions' => [
                [
                    'province' => 'Batangas',
                    'municipalities' => ['Nasugbu'],
                ],
            ],
            'barangays' => self::BARANGAYS,
        ], 200, $headers);
    }

    private function matchesCurrentEtag(?string $ifNoneMatch): bool
    {
        if ($ifNoneMatch === null) {
            return false;
        }

        foreach (explode(',', $ifNoneMatch) as $candidate) {
            $candidate = trim($candidate);

            if ($candidate === '*' || $candidate === self::ETAG
                || $candidate === 'W/'.self::ETAG) {
                return true;
            }
        }

        return false;
    }
}
