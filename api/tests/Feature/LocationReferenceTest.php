<?php

namespace Tests\Feature;

use Tests\TestCase;

class LocationReferenceTest extends TestCase
{
    private const ETAG = '"locations-2026-08-13"';

    public function test_location_reference_returns_the_batangas_nasugbu_seed_data(): void
    {
        $response = $this->getJson('/api/v1/reference/locations');

        $response
            ->assertOk()
            ->assertHeader('ETag', self::ETAG)
            ->assertExactJson([
                'version' => '2026-08-13T00:00:00.000Z',
                'etag' => self::ETAG,
                'regions' => [
                    [
                        'province' => 'Batangas',
                        'municipalities' => ['Nasugbu'],
                    ],
                ],
                'barangays' => [
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
                ],
            ]);
    }

    public function test_matching_etag_returns_not_modified(): void
    {
        $this->withHeader('If-None-Match', self::ETAG)
            ->getJson('/api/v1/reference/locations')
            ->assertStatus(304)
            ->assertHeader('ETag', self::ETAG)
            ->assertContent('');
    }

    public function test_non_matching_etag_returns_the_current_snapshot(): void
    {
        $this->withHeader('If-None-Match', '"locations-stale"')
            ->getJson('/api/v1/reference/locations')
            ->assertOk()
            ->assertHeader('ETag', self::ETAG)
            ->assertJsonPath('version', '2026-08-13T00:00:00.000Z')
            ->assertJsonPath('regions.0.province', 'Batangas')
            ->assertJsonPath('regions.0.municipalities.0', 'Nasugbu')
            ->assertJsonCount(42, 'barangays');
    }

    public function test_location_reference_is_public(): void
    {
        $this->getJson('/api/v1/reference/locations')
            ->assertOk()
            ->assertJsonStructure([
                'version',
                'etag',
                'regions' => [
                    '*' => ['province', 'municipalities'],
                ],
                'barangays',
            ]);
    }
}
