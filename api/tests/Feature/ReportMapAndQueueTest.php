<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportMapAndQueueTest extends TestCase
{
    use RefreshDatabase;

    public function test_map_groups_visible_reports_within_25_meters_without_changing_evidence_or_queue_rows(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $anchor = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'final_latitude' => 14.1, 'final_longitude' => 120.6,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $near = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'final_latitude' => 14.10018, 'final_longitude' => 120.6,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $far = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'final_latitude' => 14.1005, 'final_longitude' => 120.6,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        Sanctum::actingAs($reviewer);
        $response = $this->getJson('/api/v1/reports/map')->assertOk()
            ->assertJsonPath('features.0.properties.location_group_key', $anchor->uuid)
            ->assertJsonPath('features.1.properties.location_group_key', $anchor->uuid)
            ->assertJsonPath('features.0.properties.location_group_size', 2)
            ->assertJsonPath('features.1.properties.location_group_size', 2)
            ->assertJsonPath('features.1.properties.location_group_coordinates', [120.6, 14.1])
            ->assertJsonPath('features.1.geometry.coordinates', [120.6, 14.10018])
            ->assertJsonPath('features.2.properties.location_group_key', $far->uuid)
            ->assertJsonPath('features.2.properties.location_group_size', 1);
        $this->assertSame($response->json(), $this->getJson('/api/v1/reports/map')->json());
        $this->assertSame(14.10018, (float) $near->fresh()->final_latitude);
        $this->getJson('/api/v1/reports/field-validation-queue')->assertOk()
            ->assertJsonPath('data.count', 3)->assertJsonCount(3, 'data.items');
        $this->getJson('/api/v1/reports/map?limit=1')->assertOk()
            ->assertJsonPath('metadata.truncated', true)
            ->assertJsonPath('features.0.properties.location_group_size', 1);
    }

    public function test_location_groups_never_count_or_name_hidden_or_filtered_members(): void
    {
        $other = District::query()->create(['code' => 'other-test', 'name' => 'Other']);
        $hidden = Report::factory()->inDistrict($other)->create([
            'final_latitude' => 14.1, 'final_longitude' => 120.6,
        ]);
        $visible = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Visible', 'final_latitude' => 14.1, 'final_longitude' => 120.6,
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Filtered', 'final_latitude' => 14.1, 'final_longitude' => 120.6,
        ]);
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());
        $this->getJson('/api/v1/reports/map?barangay=Visible')->assertOk()
            ->assertJsonCount(1, 'features')
            ->assertJsonPath('features.0.properties.location_group_key', $visible->uuid)
            ->assertJsonPath('features.0.properties.location_group_size', 1)
            ->assertJsonMissing(['location_group_key' => $hidden->uuid]);
    }

    public function test_map_returns_private_geojson_with_filters_and_coverage_metadata(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $located = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MAP-LOCATED',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Balaytigui',
            'final_latitude' => 14.1260,
            'final_longitude' => 120.6039,
            'observed_at' => CarbonImmutable::parse('2026-08-13T10:20:30Z'),
            'submitted_at' => CarbonImmutable::parse('2026-08-13T11:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MAP-UNLOCATED',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Balaytigui',
            'final_latitude' => null,
            'final_longitude' => null,
            'location_source' => Report::LOCATION_SOURCE_UNAVAILABLE,
            'location_unavailable_reason' => Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
            'observed_at' => CarbonImmutable::parse('2026-08-13T12:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MAP-RESOLVED',
            'review_status' => Report::STATUS_RESOLVED,
            'barangay' => 'Balaytigui',
            'observed_at' => CarbonImmutable::parse('2026-08-13T10:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MAP-NULL-DATE',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'barangay' => 'Balaytigui',
            'observed_at' => null,
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/map?'.http_build_query([
            'date_from' => '2026-08-13',
            'date_to' => '2026-08-13',
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Balaytigui',
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]))
            ->assertOk()
            ->assertHeader('cache-control', 'no-store, private')
            ->assertJsonPath('type', 'FeatureCollection')
            ->assertJsonCount(1, 'features')
            ->assertJsonPath('features.0.id', $located->uuid)
            ->assertJsonPath('features.0.geometry.type', 'Point')
            ->assertJsonPath('features.0.geometry.coordinates.0', 120.6039)
            ->assertJsonPath('features.0.geometry.coordinates.1', 14.126)
            ->assertJsonPath('features.0.properties.predicted_label', Report::LABEL_RUST)
            ->assertJsonPath('features.0.properties.review_status', Report::STATUS_FOR_FIELD_VALIDATION)
            ->assertJsonPath('metadata.total_count', 2)
            ->assertJsonPath('metadata.located_count', 1)
            ->assertJsonPath('metadata.unlocated_count', 1)
            ->assertJsonPath('metadata.limit', 1000)
            ->assertJsonPath('metadata.returned_count', 1)
            ->assertJsonPath('metadata.truncated', false);

        $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
            'date_from' => '2026-08-13',
            'date_to' => '2026-08-13',
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Balaytigui',
        ]))
            ->assertOk()
            ->assertJsonPath('data.count', 2)
            ->assertJsonPath('data.items.0.uuid', $located->uuid)
            ->assertJsonPath('data.items.0.final_latitude', 14.126)
            ->assertJsonPath('data.items.0.final_longitude', 120.6039)
            ->assertJsonPath('data.items.1.final_latitude', null)
            ->assertJsonPath('data.items.1.final_longitude', null)
            ->assertJsonPath('data.items.1.location_source', Report::LOCATION_SOURCE_UNAVAILABLE)
            ->assertJsonPath(
                'data.items.1.location_unavailable_reason',
                Report::LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP,
            )
            ->assertJsonPath('data.items.1.location_unavailable', true);

        $this->getJson('/api/v1/reports/map?status='.Report::STATUS_RESOLVED)
            ->assertOk()
            ->assertJsonCount(1, 'features')
            ->assertJsonPath('features.0.properties.review_status', Report::STATUS_RESOLVED);
    }

    public function test_map_plots_valid_coordinates_worldwide_and_keeps_missing_or_invalid_pairs_unlocated(): void
    {
        $wawa = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MAP-WAWA-REAL-READING',
            'barangay' => 'Wawa',
            'province' => 'Batangas',
            'municipality' => 'Nasugbu',
            'final_latitude' => 13.933159,
            'final_longitude' => 120.7273218,
        ]);
        $outsideNasugbu = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MAP-POTOTAN-COORDINATES',
            'barangay' => 'Pototan',
            'province' => 'Iloilo',
            'municipality' => 'Pototan',
            'final_latitude' => 10.5,
            'final_longitude' => 122.8,
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MAP-MISSING-COORDINATES',
            'final_latitude' => null,
            'final_longitude' => null,
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MAP-INVALID-LATITUDE',
            'final_latitude' => 91,
            'final_longitude' => 122.8,
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MAP-INVALID-LONGITUDE',
            'final_latitude' => 10.5,
            'final_longitude' => 181,
        ]);

        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());

        $this->getJson('/api/v1/reports/map')
            ->assertOk()
            ->assertJsonCount(2, 'features')
            ->assertJsonPath('features.0.id', $wawa->uuid)
            ->assertJsonPath('features.0.geometry.coordinates.0', 120.7273218)
            ->assertJsonPath('features.0.geometry.coordinates.1', 13.933159)
            ->assertJsonPath('features.1.id', $outsideNasugbu->uuid)
            ->assertJsonPath('features.1.geometry.coordinates.0', 122.8)
            ->assertJsonPath('features.1.geometry.coordinates.1', 10.5)
            ->assertJsonPath('metadata.total_count', 5)
            ->assertJsonPath('metadata.located_count', 2)
            ->assertJsonPath('metadata.unlocated_count', 3);
    }

    public function test_smut_model_reports_are_available_in_map_and_field_validation_queue(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $report = Report::factory()->inDistrict($this->pilotDistrict())->mobileModelV1()->create([
            'reference_code' => 'CG-SMUT-MAP-QUEUE',
            'predicted_label' => Report::LABEL_SMUT,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'barangay' => 'Balaytigui',
            'final_latitude' => 14.1260,
            'final_longitude' => 120.6039,
            'observed_at' => CarbonImmutable::parse('2026-08-13T10:20:30Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/map?'.http_build_query([
            'predicted_label' => Report::LABEL_SMUT,
            'barangay' => 'Balaytigui',
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'features')
            ->assertJsonPath('features.0.id', $report->uuid)
            ->assertJsonPath('features.0.properties.predicted_label', Report::LABEL_SMUT);

        $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
            'predicted_label' => Report::LABEL_SMUT,
            'barangay' => 'Balaytigui',
        ]))
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.uuid', $report->uuid)
            ->assertJsonPath('data.items.0.predicted_label', Report::LABEL_SMUT);
    }

    public function test_map_limits_results_and_reports_the_truncation_contract(): void
    {
        config([
            'caneguard.map.default_limit' => 2,
            'caneguard.map.max_limit' => 2,
        ]);
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $reports = collect(range(1, 3))->map(fn (int $index) => Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-MAP-LIMIT-'.$index,
            'final_latitude' => 14.10 + ($index / 1000),
            'final_longitude' => 120.70 + ($index / 1000),
        ]));

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/map')
            ->assertOk()
            ->assertJsonCount(2, 'features')
            ->assertJsonPath('features.0.id', $reports[0]->uuid)
            ->assertJsonPath('features.1.id', $reports[1]->uuid)
            ->assertJsonPath('metadata.total_count', 3)
            ->assertJsonPath('metadata.located_count', 3)
            ->assertJsonPath('metadata.unlocated_count', 0)
            ->assertJsonPath('metadata.limit', 2)
            ->assertJsonPath('metadata.returned_count', 2)
            ->assertJsonPath('metadata.truncated', true);

        $this->getJson('/api/v1/reports/map?limit=3')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR')
            ->assertJsonStructure(['errors' => ['limit']]);
    }

    public function test_map_date_filter_uses_observed_at_and_excludes_null_observations(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $observedInRange = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'observed_at' => CarbonImmutable::parse('2026-08-13T08:00:00Z'),
            'submitted_at' => CarbonImmutable::parse('2026-08-14T08:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'observed_at' => CarbonImmutable::parse('2026-08-14T08:00:00Z'),
            'submitted_at' => CarbonImmutable::parse('2026-08-13T08:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
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

    public function test_field_validation_queue_can_bound_a_calendar_month_by_target_visit_date(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $assignee = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $inMonth = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-CALENDAR-IN',
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $inMonth->fieldValidationAssignment()->create([
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2026-09-30',
            'activated_at' => now(),
        ]);
        $outsideMonth = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-CALENDAR-OUT',
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
        ]);
        $outsideMonth->fieldValidationAssignment()->create([
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2026-10-01',
            'activated_at' => now(),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/field-validation-queue?'.http_build_query([
            'queue' => Report::QUEUE_NEEDS_VISIT,
            'due_from' => '2026-09-01',
            'due_to' => '2026-09-30',
        ]))
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.uuid', $inMonth->uuid)
            ->assertJsonPath('data.items.0.target_visit_date', '2026-09-30');
    }

    public function test_field_validation_queue_defaults_to_needs_visit_oldest_first_and_shares_non_status_filters(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $oldest = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-QUEUE-OLDEST',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_MOSAIC,
            'barangay' => 'Mabini',
            'observed_at' => CarbonImmutable::parse('2026-08-10T08:00:00Z'),
            'submitted_at' => CarbonImmutable::parse('2026-08-11T08:00:00Z'),
            'affected_area_hectares' => 2.5,
            'affected_portion_percent' => 18,
        ]);
        $sameObservationEarlierSubmit = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-QUEUE-TIE',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_MOSAIC,
            'barangay' => 'Mabini',
            'observed_at' => CarbonImmutable::parse('2026-08-10T08:00:00Z'),
            'submitted_at' => CarbonImmutable::parse('2026-08-10T08:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-QUEUE-NULL-DATE',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_MOSAIC,
            'barangay' => 'Mabini',
            'observed_at' => null,
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CG-QUEUE-VERIFIED',
            'review_status' => Report::STATUS_VERIFIED_BY_STAFF,
            'predicted_label' => Report::LABEL_MOSAIC,
            'barangay' => 'Mabini',
            'observed_at' => CarbonImmutable::parse('2026-08-09T08:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
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

        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create());

        $this->getJson('/api/v1/reports/map')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');
        $this->getJson('/api/v1/reports/field-validation-queue')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->admin()->create());

        $this->getJson('/api/v1/reports/map')
            ->assertOk()
            ->assertJsonPath('type', 'FeatureCollection');
        $this->getJson('/api/v1/reports/field-validation-queue')
            ->assertOk()
            ->assertJsonPath('data.count', 0);
    }

    public function test_map_and_queue_validate_shared_filters(): void
    {
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());

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

    public function test_queue_exposes_assignee_and_supports_assignment_filter_and_pagination(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $assignee = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create(['name' => 'Assigned Officer']);

        $assignedReport = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CR-ASSIGNED',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'observed_at' => '2026-08-10 10:00:00.000',
        ]);
        $assignedReport->fieldValidationAssignment()->create([
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
            'target_visit_date' => '2026-08-15',
            'activated_at' => now(),
        ]);

        $unassignedReport = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'reference_code' => 'CR-UNASSIGNED',
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'observed_at' => '2026-08-11 10:00:00.000',
        ]);

        Sanctum::actingAs($reviewer);

        // Verify assignee is exposed
        $this->getJson('/api/v1/reports/field-validation-queue?queue=needs_visit')
            ->assertOk()
            ->assertJsonPath('data.count', 2)
            ->assertJsonPath('data.items.0.reference_code', 'CR-ASSIGNED')
            ->assertJsonPath('data.items.0.assignee.uuid', $assignee->uuid)
            ->assertJsonPath('data.items.0.assignee.name', 'Assigned Officer')
            ->assertJsonPath('data.items.1.reference_code', 'CR-UNASSIGNED')
            ->assertJsonPath('data.items.1.assignee', null);

        // Filter: unassigned
        $this->getJson('/api/v1/reports/field-validation-queue?queue=needs_visit&assignment=unassigned')
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.items.0.reference_code', 'CR-UNASSIGNED');

        // Pagination
        $this->getJson('/api/v1/reports/field-validation-queue?queue=needs_visit&limit=1&page=2')
            ->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.page', 2)
            ->assertJsonPath('data.per_page', 1)
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.reference_code', 'CR-UNASSIGNED');
    }
}
