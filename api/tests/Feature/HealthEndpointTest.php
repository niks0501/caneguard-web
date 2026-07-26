<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class HealthEndpointTest extends TestCase
{
    public function test_health_endpoint_reports_ready_dependencies(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'status' => 'ok',
                    'checks' => [
                        'database' => 'ready',
                        'storage' => 'ready',
                    ],
                ],
            ]);
    }

    public function test_health_endpoint_does_not_expose_database_errors(): void
    {
        config([
            'database.default' => 'unavailable',
            'database.connections.unavailable' => [
                'driver' => 'sqlite',
                'database' => '/path/that/does/not/exist/database.sqlite',
                'prefix' => '',
            ],
        ]);
        DB::purge('unavailable');

        $response = $this->getJson('/api/health');

        $response
            ->assertServiceUnavailable()
            ->assertJsonPath('data.status', 'degraded')
            ->assertJsonPath('data.checks.database', 'unavailable')
            ->assertJsonMissingPath('exception')
            ->assertJsonMissingPath('message');
    }

    public function test_health_endpoint_allows_only_the_configured_credentialed_origin(): void
    {
        $this->withHeader('Origin', 'http://localhost:5173')
            ->getJson('/api/health')
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
            ->assertHeader('Access-Control-Allow-Credentials', 'true');

        $this->withHeader('Origin', 'https://untrusted.example')
            ->getJson('/api/health')
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    }

    public function test_stateful_auth_routes_support_credentialed_cors_and_json_errors(): void
    {
        $headers = [
            'Accept' => 'application/json',
            'Origin' => 'http://localhost:5173',
        ];

        $this->withHeaders($headers)
            ->postJson('/login')
            ->assertUnprocessable()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
            ->assertHeader('Access-Control-Allow-Credentials', 'true')
            ->assertJsonValidationErrors('email');

        $this->withHeaders($headers)
            ->postJson('/logout')
            ->assertUnauthorized()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
            ->assertHeader('Access-Control-Allow-Credentials', 'true')
            ->assertExactJson([
                'message' => 'Unauthenticated.',
                'code' => 'UNAUTHENTICATED',
            ]);
    }
}
