<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportMapAndQueueTest extends TestCase
{
    use RefreshDatabase;

    public function test_map_returns_private_geojson_with_filters_and_coverage_metadata(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $located = Report::factory()->create([
            'reference_code' => 'CG-MAP-LOCATED',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Mabini',
            'final_latitude' => 10.1234567,
            'final_longitude' => 122.9876543,
            'observed_at' => CarbonImmutable::parse('2026-08-13T10:20:30Z'),
            'submitted_at' => CarbonImmutable::parse('2026-08-13T11:00:00Z'),
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-MAP-UNLOCATED',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Mabini',
            'final_latitude' => null,
            'final_longitude' => null,
            'observed_at' => CarbonImmutable::parse('2026-08-13T12:00:00Z'),
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-MAP-RESOLVED',
            'review_status' => Report::STATUS_RESOLVED,
            'barangay' => 'Mabini',
            'observed_at' => CarbonImmutable::parse('2026-08-13T10:00:00Z'),
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-MAP-NULL-DATE',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'barangay' => 'Mabini',
            'observed_at' => null,
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/map?'.http_build_query([
            'date_from' => '2026-08-13',
            'date_to' => '2026-08-13',
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Mabini',
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]))
            ->assertOk()
            ->assertHeader('cache-control', 'no-store, private')
            ->assertJsonPath('type', 'FeatureCollection')
            ->assertJsonCount(1, 'features')
            ->assertJsonPath('features.0.id', $located->uuid)
            ->assertJsonPath('features.0.geometry.type', 'Point')
            ->assertJsonPath('features.0.geometry.coordinates.0', 122.9876543)
            ->assertJsonPath('features.0.geometry.coordinates.1', 10.1234567)
            ->assertJsonPath('features.0.properties.predicted_label', Report::LABEL_RUST)
            ->assertJsonPath('features.0.properties.review_status', Report::STATUS_FOR_FIELD_VALIDATION)
            ->assertJsonPath('metadata.total_count', 2)
            ->assertJsonPath('metadata.located_count', 1)
            ->assertJsonPath('metadata.unlocated_count', 1);

        $this->getJson('/api/v1/reports/map?status='.Report::STATUS_RESOLVED)
            ->assertOk()
            ->assertJsonCount(1, 'features')
            ->assertJsonPath('features.0.properties.review_status', Report::STATUS_RESOLVED);
    }

    public function test_map_date_filter_uses_observed_at_and_excludes_null_observations(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $observedInRange = Report::factory()->create([
            'observed_at' => CarbonImmutable::parse('2026-08-13T08:00:00Z'),
            'submitted_at' => CarbonImmutable::parse('2026-08-14T08:00:00Z'),
        ]);
        Report::factory()->create([
            'observed_at' => CarbonImmutable::parse('2026-08-14T08:00:00Z'),
            'submitted_at' => CarbonImmutable::parse('2026-08-13T08:00:00Z'),
        ]);
        Report::factory()->create([
            'observed_at' => null,
            'submitted_at' => CarbonImmutable::parse('2026-08-13T08:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/map?'.http_build_query([
            'date_from' => '2026-08-13',
            'date_to' => '2026-08-13',
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'features')
            ->assertJsonPath('features.0.id', $observedInRange->uuid);
    }

    public function test_field_validation_queue_is_fixed_oldest_first_and_shares_non_status_filters(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $oldest = Report::factory()->create([
            'reference_code' => 'CG-QUEUE-OLDEST',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_MOSAIC,
            'barangay' => 'Mabini',
            'observed_at' => CarbonImmutable::parse('2026-08-10T08:00:00Z'),
            'submitted_at' => CarbonImmutable::parse('2026-08-11T08:00:00Z'),
            'affected_area_hectares' => 2.5,
            'affected_portion_percent' => 18,
        ]);
        $sameObservationEarlierSubmit = Report::factory()->create([
            'reference_code' => 'CG-QUEUE-TIE',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_MOSAIC,
            'barangay' => 'Mabini',
            'observed_at' => CarbonImmutable::parse('2026-08-10T08:00:00Z'),
            'submitted_at' => CarbonImmutable::parse('2026-08-10T08:00:00Z'),
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-QUEUE-NULL-DATE',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_MOSAIC,
            'barangay' => 'Mabini',
            'observed_at' => null,
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-QUEUE-VERIFIED',
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'predicted_label' => Report::LABEL_MOSAIC,
            'barangay' => 'Mabini',
            'observed_at' => CarbonImmutable::parse('2026-08-09T08:00:00Z'),
        ]);
        Report::factory()->create([
            'reference_code' => 'CG-QUEUE-OTHER-BARANGAY',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_MOSAIC,
            'barangay' => 'Poblacion',
            'observed_at' => CarbonImmutable::parse('2026-08-08T08:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
            'status' => Report::STATUS_VERIFIED_BY_STAFF,
            'predicted_label' => Report::LABEL_MOSAIC,
            'barangay' => 'Mabini',
            'limit' => 10,
        ]))
            ->assertOk()
            ->assertJsonPath('data.count', 3)
            ->assertJsonPath('data.oldest.uuid', $sameObservationEarlierSubmit->uuid)
            ->assertJsonPath('data.items.0.uuid', $sameObservationEarlierSubmit->uuid)
            ->assertJsonPath('data.items.1.uuid', $oldest->uuid)
            ->assertJsonPath('data.items.2.observed_at', null)
            ->assertJsonPath('data.items.1.affected_area_hectares', 2.5)
            ->assertJsonPath('data.items.1.affected_portion_percent', 18)
            ->assertJsonPath('data.items.0.review_status', Report::STATUS_FOR_FIELD_VALIDATION);
    }

    public function test_map_and_queue_require_reviewer_or_admin_authorization(): void
    {
        $this->getJson('/api/v1/reports/map')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');
        $this->getJson('/api/v1/reports/field-validation-queue')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());

        $this->getJson('/api/v1/reports/map')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
        $this->getJson('/api/v1/reports/field-validation-queue')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->admin()->create());

        $this->getJson('/api/v1/reports/map')
            ->assertOk()
            ->assertJsonPath('type', 'FeatureCollection');
        $this->getJson('/api/v1/reports/field-validation-queue')
            ->assertOk()
            ->assertJsonPath('data.count', 0);
    }

    public function test_map_and_queue_validate_shared_filters(): void
    {
        Sanctum::actingAs(User::factory()->reviewer()->create());

        foreach (['/api/v1/reports/map', '/api/v1/reports/field-validation-queue'] as $path) {
            $this->getJson($path.'?'.http_build_query([
                'date_from' => '2026-08-14',
                'date_to' => '2026-08-13',
                'predicted_label' => 'not-a-label',
                'barangay' => str_repeat('x', 121),
            ]))
                ->assertUnprocessable()
                ->assertJsonPath('code', 'VALIDATION_ERROR')
                ->assertJsonStructure(['errors' => ['date_to', 'predicted_label', 'barangay']]);
        }
    }
}
