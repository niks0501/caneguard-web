<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

class ReportApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_reports_are_searchable_filterable_sorted_and_paginated(): void
    {
        $reporter = User::factory()->fieldReporter()->create([
            'name' => 'Ana Field Reporter',
        ]);
        $reviewer = User::factory()->reviewer()->create();
        $matching = Report::factory()->create([
            'reporter_id' => $reporter,
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'confidence' => 0.93,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-07-20T10:00:00Z'),
        ]);
        Report::factory()->create([
            'barangay' => 'Poblacion',
            'predicted_label' => Report::LABEL_HEALTHY,
            'review_status' => Report::STATUS_RESOLVED,
            'submitted_at' => CarbonImmutable::parse('2026-07-18T10:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports?'.http_build_query([
            'search' => 'Ana Field',
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Mabini',
            'date_from' => '2026-07-20',
            'date_to' => '2026-07-20',
            'sort' => '-confidence',
            'per_page' => 1,
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $matching->uuid)
            ->assertJsonPath('data.0.reporter.name', 'Ana Field Reporter')
            ->assertJsonPath(
                'data.0.captured_at',
                $matching->captured_at->utc()->toISOString(),
            )
            ->assertJsonPath(
                'data.0.image_url',
                route('api.v1.reports.image', ['report' => $matching->uuid]),
            )
            ->assertJsonPath('meta.total', 1)
            ->assertJsonStructure(['data', 'links', 'meta']);
    }

    public function test_report_search_treats_like_wildcards_as_literal_text(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $literal = Report::factory()->create([
            'reference_code' => 'CG-2026-%_!',
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-2026-PLAIN',
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports?'.http_build_query([
            'search' => '%_!',
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uuid', $literal->uuid);
    }

    public function test_report_list_rejects_invalid_query_values(): void
    {
        Sanctum::actingAs(User::factory()->reviewer()->create());

        $this->getJson('/api/v1/reports?'.http_build_query([
            'page' => 0,
            'status' => 'confirmed',
            'predicted_label' => 'smut',
            'date_from' => '2026-07-20',
            'date_to' => '2026-07-19',
            'sort' => 'random',
        ]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR')
            ->assertJsonStructure([
                'errors' => [
                    'page',
                    'status',
                    'predicted_label',
                    'date_to',
                    'sort',
                ],
            ]);
    }

    public function test_report_detail_uses_uuid_and_returns_every_contract_section(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->create();

        Sanctum::actingAs($reviewer);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.identity.uuid', $report->uuid)
            ->assertJsonStructure([
                'data' => [
                    'identity',
                    'reporter',
                    'barangay',
                    'timestamps',
                    'image',
                    'model',
                    'observations',
                    'review',
                    'updated_at',
                ],
            ]);

        $this->getJson('/api/v1/reports/not-a-real-uuid')
            ->assertNotFound()
            ->assertJsonPath('code', 'NOT_FOUND');
    }

    public function test_report_image_is_private_and_policy_authorized(): void
    {
        Storage::fake('local');
        $report = Report::factory()->create([
            'image_path' => 'reports/private-evidence.png',
            'image_mime_type' => 'image/png',
        ]);
        Storage::disk('local')->put(
            $report->image_path,
            'private-image-content',
        );
        $path = "/api/v1/reports/{$report->uuid}/image";

        $this->getJson($path)
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());
        $this->getJson($path)
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->reviewer()->create());
        $response = $this->get($path);
        $response
            ->assertOk()
            ->assertHeader('content-type', 'image/png')
            ->assertHeader('cache-control', 'max-age=300, private')
            ->assertHeader('x-content-type-options', 'nosniff');
        $this->assertSame(
            'private-image-content',
            $response->streamedContent(),
        );
        $this->assertSame([], config('filesystems.links'));
    }

    public function test_dashboard_returns_all_status_counts_and_five_recent_reports(): void
    {
        $reviewer = User::factory()->reviewer()->create();

        foreach (Report::reviewStatuses() as $index => $status) {
            Report::factory()->create([
                'review_status' => $status,
                'submitted_at' => now()->subMinutes($index),
            ]);
        }
        Report::factory()->count(2)->create([
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            'submitted_at' => now()->subHour(),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('data.counts.total_submitted', 7)
            ->assertJsonPath('data.counts.submitted_unverified', 3)
            ->assertJsonPath('data.counts.for_field_validation', 1)
            ->assertJsonPath('data.counts.verified_by_staff', 1)
            ->assertJsonPath('data.counts.unable_to_verify', 1)
            ->assertJsonPath('data.counts.resolved', 1)
            ->assertJsonCount(5, 'data.recent_reports');
    }

    public function test_report_queue_rejects_unauthenticated_and_wrong_role_users(): void
    {
        $this->getJson('/api/v1/reports')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());

        $this->getJson('/api/v1/reports')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    public function test_unexpected_api_errors_do_not_leak_exception_details(): void
    {
        Route::get('/api/v1/forced-failure', function (): never {
            throw new RuntimeException('Sensitive internal failure detail.');
        });

        $this->getJson('/api/v1/forced-failure')
            ->assertInternalServerError()
            ->assertExactJson([
                'message' => 'An unexpected server error occurred.',
                'code' => 'SERVER_ERROR',
            ]);
    }
}
