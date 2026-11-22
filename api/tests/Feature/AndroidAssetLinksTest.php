<?php

namespace Tests\Feature;

use Tests\TestCase;

class AndroidAssetLinksTest extends TestCase
{
    public function test_serves_digital_asset_links_json_when_fingerprints_are_configured(): void
    {
        $fingerprint = str_repeat('AA:', 31).'AA';
        config(['caneguard.android_app_links.cert_fingerprints' => [$fingerprint]]);

        $response = $this->get('/.well-known/assetlinks.json')->assertOk();

        $this->assertStringStartsWith('application/json', (string) $response->headers->get('Content-Type'));
        $response->assertExactJson([[
            'relation' => ['delegate_permission/common.handle_all_urls'],
            'target' => [
                'namespace' => 'android_app',
                'package_name' => 'com.niks0501.caneguard',
                'sha256_cert_fingerprints' => [$fingerprint],
            ],
        ]]);
    }

    public function test_returns_404_rather_than_the_spa_shell_without_fingerprints(): void
    {
        config(['caneguard.android_app_links.cert_fingerprints' => []]);

        $this->get('/.well-known/assetlinks.json')->assertNotFound();
    }
}
