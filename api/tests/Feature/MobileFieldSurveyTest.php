<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\DistrictMembership;
use App\Models\FieldSurvey;
use App\Models\User;
use App\Rules\MeasurementProvenance;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MobileFieldSurveyTest extends TestCase
{
    use RefreshDatabase;

    private const ENDPOINT = '/api/v1/mobile/field-surveys';

    public function test_real_mobile_login_stores_geometry_measurements_and_server_owned_attribution(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create(['password' => 'A surveyed boundary passphrase']);
        $token = $this->postJson('/api/v1/mobile/auth/login', [
            'email' => $inspector->email,
            'password' => 'A surveyed boundary passphrase',
            'device_name' => 'Pilot phone',
        ])->assertOk()->json('token');
        $payload = $this->payload() + ['inspector_id' => 999, 'district_id' => 999, 'status' => 'rejected'];
        $receipt = $this->withToken($token)->postJson(self::ENDPOINT, $payload)->assertCreated();
        $survey = FieldSurvey::query()->sole();
        $receipt->assertExactJson(['id' => (string) $survey->id, 'status' => 'kept']);
        $this->assertIsString($receipt->json('id'));
        $this->assertSame($payload['polygon'], $survey->polygon);
        $this->assertSame($payload['area_sqm'], $survey->area_sqm);
        $this->assertSame('2026-10-04T02:30:12.123456Z', $survey->captured_at->toISOString());
        $this->assertSame($inspector->id, $survey->inspector_id);
        $this->assertSame($district->id, $survey->district_id);
        $this->assertDatabaseCount('reports', 0);
        Auth::forgetGuards();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->withoutToken()->actingAs($reviewer, 'web');
        $this->getJson('/api/v1/reports/map')->assertOk()->assertJsonCount(0, 'features')
            ->assertJsonPath('metadata.total_count', 0);
        $this->getJson('/api/v1/reports/field-validation-queue')->assertOk()->assertJsonPath('data.count', 0);
    }

    public function test_closed_rings_accept_numeric_equivalence_precise_points_and_holes(): void
    {
        $this->loginInspector();
        $payload = $this->payload();
        $payload['polygon']['coordinates'] = [
            [[0, 0], [0.000000000000001, 0], [0, 0.000000000000001], [0.0, -0.0]],
            [[122.95, 10.7], [122.95001, 10.7], [122.95, 10.70001], [122.95, 10.7]],
        ];
        $this->postJson(self::ENDPOINT, $payload)->assertCreated();
        $this->assertEquals($payload['polygon'], FieldSurvey::query()->sole()->polygon);
    }

    public function test_valid_replay_keeps_original_record_and_never_updates_measurement_or_shape(): void
    {
        $this->loginInspector();
        $payload = $this->payload();
        $id = $this->postJson(self::ENDPOINT, $payload)->assertCreated()->json('id');
        $before = FieldSurvey::findOrFail($id)->getRawOriginal();
        $payload['client_uuid'] = strtoupper($payload['client_uuid']);
        $payload['area_sqm'] = 99;
        $payload['captured_at'] = '2026-10-05T12:00:00Z';
        $payload['polygon']['coordinates'][0][1][0] += 0.001;
        $payload['affected_area_polygons'] = [$this->affectedPolygon()];
        $payload['affected_area_sqm'] = 12.5;
        $payload['measurement_provenance'] = ['method' => 'replayed'];
        $this->postJson(self::ENDPOINT, $payload)->assertCreated()->assertExactJson(['id' => $id, 'status' => 'kept']);
        $this->assertDatabaseCount('field_surveys', 1);
        $this->assertSame($before, FieldSurvey::findOrFail($id)->getRawOriginal());
    }

    public function test_affected_area_surveys_persist_polygons_measured_area_and_waypoint_evidence(): void
    {
        $this->loginInspector();
        $payload = $this->payload();
        $payload['affected_area_polygons'] = [
            $this->affectedPolygon(),
            ['type' => 'Polygon', 'coordinates' => [[
                [122.9503, 10.7003], [122.9505, 10.7003], [122.9503, 10.7005], [122.9503, 10.7003],
            ]]],
        ];
        $payload['affected_area_sqm'] = 6986.25;
        $payload['measurement_provenance'] = [
            'method' => 'wgs84-ellipsoid-geodesic',
            'plot_area_sqm' => 29160.0,
            'affected_area_sqm' => 6986.25,
            'source_polygon_count' => 2,
            'overlap_removed' => true,
            'containment_tolerance_m' => 12.5,
            'affected_area_waypoint_provenance' => [
                [[
                    'latitude' => 10.7,
                    'longitude' => 122.95,
                    'source' => 'gps',
                    'accuracy_meters' => 4.5,
                    'captured_at' => '2026-10-04T10:30:10.123456+08:00',
                ]],
                [[
                    'latitude' => 10.7003,
                    'longitude' => 122.9503,
                    'source' => 'map',
                    'accuracy_meters' => null,
                    'captured_at' => '2026-10-04T10:30:11',
                ]],
            ],
        ];
        $payload['affected_area_waypoints'] = [
            [[
                'latitude' => 10.700078,
                'longitude' => 122.950193,
                'source' => 'gps',
                'accuracy_meters' => 4.5,
                'captured_at' => '2026-10-04T10:30:10.123456+08:00',
                'reading' => 'walked',
            ]],
            [[
                'latitude' => 10.7003,
                'longitude' => 122.9503,
                'source' => 'map',
                'accuracy_meters' => null,
                'captured_at' => '2026-10-04T10:30:11',
            ]],
        ];

        $receipt = $this->postJson(self::ENDPOINT, $payload)->assertCreated();
        $survey = FieldSurvey::query()->sole();
        $receipt->assertExactJson(['id' => (string) $survey->id, 'status' => 'kept']);
        $this->assertEquals($payload['affected_area_polygons'], $survey->affected_area_polygons);
        $this->assertSame('6986.2500', $survey->affected_area_sqm);
        $this->assertEquals($payload['measurement_provenance'], $survey->measurement_provenance);
        $this->assertEquals($payload['affected_area_waypoints'], $survey->affected_area_waypoints);
        $fresh = $survey->fresh();
        $this->assertEquals($payload['affected_area_polygons'], $fresh->affected_area_polygons);
        $this->assertSame('6986.2500', $fresh->affected_area_sqm);
        $this->assertEquals($payload['measurement_provenance'], $fresh->measurement_provenance);
        $this->assertEquals($payload['affected_area_waypoints'], $fresh->affected_area_waypoints);
    }

    public function test_legacy_payload_without_affected_area_evidence_stores_nulls(): void
    {
        $this->loginInspector();
        $this->postJson(self::ENDPOINT, $this->payload())->assertCreated();
        $survey = FieldSurvey::query()->sole();
        $this->assertNull($survey->affected_area_polygons);
        $this->assertNull($survey->affected_area_sqm);
        $this->assertNull($survey->measurement_provenance);
        $this->assertNull($survey->affected_area_waypoints);
    }

    public function test_affected_area_sqm_accepts_the_largest_figure_the_column_stores(): void
    {
        $this->loginInspector();
        $payload = $this->payload();
        $payload['affected_area_sqm'] = 9999999999999998.0;
        $this->postJson(self::ENDPOINT, $payload)->assertCreated();
        $this->assertSame('9999999999999998.0000', FieldSurvey::query()->sole()->affected_area_sqm);
    }

    public function test_affected_area_polygons_share_one_position_budget(): void
    {
        $this->loginInspector();
        $payload = $this->payload();
        $payload['affected_area_polygons'] = [$this->largeAffectedPolygon(), $this->largeAffectedPolygon(0.001)];
        $payload['affected_area_sqm'] = 100.0;
        $this->postJson(self::ENDPOINT, $payload)->assertUnprocessable()
            ->assertJsonValidationErrors('affected_area_polygons');
        $this->assertDatabaseCount('field_surveys', 0);
    }

    public function test_waypoint_budget_is_reachable_inside_the_byte_cap_at_gps_precision(): void
    {
        $this->loginInspector();
        $waypoint = [
            'latitude' => 10.700078,
            'longitude' => 122.950193,
            'source' => 'gps',
            'accuracy_meters' => 12.3456,
            'captured_at' => '2026-10-04T10:30:10.123456+08:00',
        ];
        $provenance = [
            'method' => 'wgs84-ellipsoid-geodesic',
            'plot_area_sqm' => 29160,
            'affected_area_sqm' => 4860.5,
            'source_polygon_count' => 1,
            'overlap_removed' => false,
        ];
        $payload = $this->payload();
        $payload['measurement_provenance'] = $provenance + [
            'affected_area_waypoint_provenance' => [array_fill(0, MeasurementProvenance::MAX_WAYPOINTS, $waypoint)],
        ];
        $payload['affected_area_waypoints'] = [array_fill(0, MeasurementProvenance::MAX_WAYPOINTS, $waypoint)];

        $this->postJson(self::ENDPOINT, $payload)->assertCreated();
        $survey = FieldSurvey::query()->sole();
        $this->assertCount(
            MeasurementProvenance::MAX_WAYPOINTS,
            $survey->measurement_provenance['affected_area_waypoint_provenance'][0],
        );
        $this->assertCount(MeasurementProvenance::MAX_WAYPOINTS, $survey->affected_area_waypoints[0]);

        $payload['client_uuid'] = (string) Str::uuid();
        $payload['affected_area_waypoints'] = null;
        $payload['measurement_provenance']['affected_area_waypoint_provenance'] = [
            array_fill(0, MeasurementProvenance::MAX_WAYPOINTS + 1, $waypoint),
        ];
        $this->postJson(self::ENDPOINT, $payload)->assertUnprocessable()
            ->assertJsonValidationErrors('measurement_provenance');

        $payload['client_uuid'] = (string) Str::uuid();
        $payload['measurement_provenance'] = $provenance;
        $payload['affected_area_waypoints'] = [array_fill(0, MeasurementProvenance::MAX_WAYPOINTS + 1, $waypoint)];
        $this->postJson(self::ENDPOINT, $payload)->assertUnprocessable()
            ->assertJsonValidationErrors('affected_area_waypoints');

        $this->assertDatabaseCount('field_surveys', 1);
    }

    #[DataProvider('invalidAffectedAreaEvidence')]
    public function test_invalid_affected_area_evidence_is_rejected_per_field(string $field, mixed $value, string $errorKey): void
    {
        $this->loginInspector();
        $payload = $this->payload();
        $payload[$field] = $value;
        $this->postJson(self::ENDPOINT, $payload)->assertUnprocessable()->assertJsonValidationErrors($errorKey);
        $this->assertDatabaseCount('field_surveys', 0);
    }

    public static function invalidAffectedAreaEvidence(): array
    {
        $polygon = ['type' => 'Polygon', 'coordinates' => [[
            [122.95, 10.7], [122.9502, 10.7], [122.95, 10.7002], [122.95, 10.7],
        ]]];
        $waypoint = [
            'source' => 'gps',
            'accuracy_meters' => 3.5,
            'captured_at' => '2026-10-04T10:30:11Z',
        ];

        return [
            ['affected_area_polygons', 'not-a-list', 'affected_area_polygons'],
            ['affected_area_polygons', ['shape' => $polygon], 'affected_area_polygons'],
            ['affected_area_polygons', [$polygon, ['type' => 'Polygon', 'coordinates' => [[[0, 0], [1, 0], [0, 1]]]]], 'affected_area_polygons.1'],
            ['affected_area_polygons', array_fill(0, 101, $polygon), 'affected_area_polygons'],
            ['affected_area_polygons', [['type' => 'MultiPolygon', 'coordinates' => []]], 'affected_area_polygons.0'],
            ['affected_area_sqm', -1, 'affected_area_sqm'],
            ['affected_area_sqm', 1.0E16, 'affected_area_sqm'],
            ['affected_area_sqm', '12.5', 'affected_area_sqm'],
            ['affected_area_sqm', true, 'affected_area_sqm'],
            ['affected_area_sqm', [], 'affected_area_sqm'],
            ['measurement_provenance', 'provenance', 'measurement_provenance'],
            ['measurement_provenance', [['method' => 'wgs84-ellipsoid-geodesic']], 'measurement_provenance'],
            ['measurement_provenance', ['affected_area_waypoint_provenance' => [['not-a-waypoint']]], 'measurement_provenance'],
            ['measurement_provenance', ['affected_area_waypoint_provenance' => [[array_replace($waypoint, ['source' => 'satellite'])]]], 'measurement_provenance'],
            ['measurement_provenance', ['affected_area_waypoint_provenance' => [[array_replace($waypoint, ['accuracy_meters' => -1])]]], 'measurement_provenance'],
            ['measurement_provenance', ['affected_area_waypoint_provenance' => [[array_diff_key($waypoint, ['accuracy_meters' => true])]]], 'measurement_provenance'],
            ['measurement_provenance', ['affected_area_waypoint_provenance' => [[array_replace($waypoint, ['captured_at' => '2026-10-04 10:30:11'])]]], 'measurement_provenance'],
            ['measurement_provenance', ['affected_area_waypoint_provenance' => [[array_replace($waypoint, ['captured_at' => '2026-02-30T10:30:11Z'])]]], 'measurement_provenance'],
            ['measurement_provenance', ['affected_area_waypoint_provenance' => [[array_replace($waypoint, ['captured_at' => '2026-13-45T10:30:11+08:00'])]]], 'measurement_provenance'],
            ['measurement_provenance', ['affected_area_waypoint_provenance' => [[array_replace($waypoint, ['captured_at' => '2026-10-04T99:99:99Z'])]]], 'measurement_provenance'],
            ['measurement_provenance', ['note' => str_repeat('a', 262145)], 'measurement_provenance'],
            ['affected_area_waypoints', 'not-a-list', 'affected_area_waypoints'],
            ['affected_area_waypoints', ['shape' => $waypoint], 'affected_area_waypoints'],
            ['affected_area_waypoints', [$waypoint], 'affected_area_waypoints'],
            ['affected_area_waypoints', [['not-a-waypoint']], 'affected_area_waypoints'],
            ['affected_area_waypoints', [[array_replace($waypoint, ['source' => 'satellite'])]], 'affected_area_waypoints'],
            ['affected_area_waypoints', [[array_replace($waypoint, ['accuracy_meters' => -1])]], 'affected_area_waypoints'],
            ['affected_area_waypoints', [[array_diff_key($waypoint, ['accuracy_meters' => true])]], 'affected_area_waypoints'],
            ['affected_area_waypoints', [[array_replace($waypoint, ['captured_at' => '2026-10-04 10:30:11'])]], 'affected_area_waypoints'],
            ['affected_area_waypoints', [[array_replace($waypoint, ['captured_at' => '2026-02-30T10:30:11Z'])]], 'affected_area_waypoints'],
            ['affected_area_waypoints', [[array_replace($waypoint, ['captured_at' => '2026-13-45T10:30:11+08:00'])]], 'affected_area_waypoints'],
            ['affected_area_waypoints', [[array_replace($waypoint, ['captured_at' => '2026-10-04T99:99:99Z'])]], 'affected_area_waypoints'],
            ['affected_area_waypoints', array_fill(0, 101, [$waypoint]), 'affected_area_waypoints'],
        ];
    }

    public function test_affected_area_migration_keeps_measured_evidence_on_rollback(): void
    {
        $this->loginInspector();
        $payload = $this->payload() + ['affected_area_sqm' => 12.5];
        $this->postJson(self::ENDPOINT, $payload)->assertCreated();
        $before = FieldSurvey::query()->sole()->getRawOriginal();

        $migration = require database_path('migrations/2026_11_01_000000_add_affected_area_fields_to_field_surveys_table.php');
        $migration->down();
        $migration->up();

        $this->assertTrue(Schema::hasColumn('field_surveys', 'affected_area_polygons'));
        $this->assertTrue(Schema::hasColumn('field_surveys', 'affected_area_sqm'));
        $this->assertTrue(Schema::hasColumn('field_surveys', 'measurement_provenance'));
        $this->assertTrue(Schema::hasColumn('field_surveys', 'affected_area_waypoints'));
        $this->assertSame($before, FieldSurvey::query()->sole()->getRawOriginal());
    }

    public function test_replay_is_owner_bound_and_does_not_disclose_another_inspectors_receipt(): void
    {
        $this->loginInspector();
        $payload = $this->payload();
        $this->postJson(self::ENDPOINT, $payload)->assertCreated();
        $this->loginInspector();
        $this->postJson(self::ENDPOINT, $payload)->assertUnprocessable()
            ->assertJsonValidationErrors('client_uuid')->assertJsonMissingPath('id');
        $this->assertDatabaseCount('field_surveys', 1);
    }

    public function test_unauthenticated_invalid_expired_and_revoked_tokens_cannot_ingest(): void
    {
        $payload = $this->payload();
        $this->postJson(self::ENDPOINT, $payload)->assertUnauthorized();
        $this->withToken('not-a-real-login')->postJson(self::ENDPOINT, $payload)->assertUnauthorized();
        $inspector = User::factory()->inDistrict($this->pilotDistrict())->create();
        foreach (['expired', 'revoked', 'indefinite', 'overlong', 'aged'] as $kind) {
            $token = $inspector->createToken('survey-'.$kind, ['report:submit']);
            match ($kind) {
                'expired' => $token->accessToken->forceFill(['expires_at' => now()->subSecond()])->save(),
                'revoked' => $token->accessToken->delete(),
                'indefinite' => $token->accessToken->forceFill(['expires_at' => null])->save(),
                'overlong' => $token->accessToken->forceFill(['expires_at' => now()->addDays(31)])->save(),
                'aged' => $token->accessToken->forceFill(['created_at' => now()->subDays(31)])->save(),
            };
            Auth::forgetGuards();
            $this->withToken($token->plainTextToken)->postJson(self::ENDPOINT, $payload)->assertUnauthorized();
        }
        $this->assertDatabaseCount('field_surveys', 0);
    }

    #[DataProvider('forbiddenRoles')]
    public function test_non_inspector_roles_have_no_wildcard_or_cookie_bypass(string $role): void
    {
        $user = User::factory()->inDistrict($this->pilotDistrict())->create(['role' => $role]);
        $this->withToken($user->createToken('forged-survey-wildcard', ['*'])->plainTextToken)
            ->postJson(self::ENDPOINT, $this->payload())->assertForbidden();
        $this->withoutToken();
        Auth::forgetGuards();
        $this->actingAs($user, 'web')->postJson(self::ENDPOINT, $this->payload())->assertForbidden();
        $this->assertDatabaseCount('field_surveys', 0);
    }

    public static function forbiddenRoles(): array
    {
        return [['farmer'], ['reviewer'], ['admin'], ['disabled'], ['expert']];
    }

    public function test_unverified_unassigned_foreign_and_revoked_memberships_are_denied(): void
    {
        $district = $this->pilotDistrict();
        $foreign = District::query()->create(['code' => 'foreign', 'name' => 'Foreign']);
        $revoked = User::factory()->inDistrict($district)->create();
        DistrictMembership::query()->where('user_id', $revoked->id)->firstOrFail()->update(['revoked_at' => now()]);
        foreach ([
            User::factory()->unverified()->inDistrict($district)->create(),
            User::factory()->create(),
            User::factory()->inDistrict($foreign)->create(),
            $revoked,
        ] as $user) {
            Auth::forgetGuards();
            $this->withToken($user->createToken('survey-wildcard', ['*'])->plainTextToken)
                ->postJson(self::ENDPOINT, $this->payload())->assertForbidden();
        }
        $this->assertDatabaseCount('field_surveys', 0);
    }

    public function test_pilot_configuration_and_token_ability_are_fail_closed(): void
    {
        $this->loginInspector(['report:status']);
        $this->postJson(self::ENDPOINT, $this->payload())->assertForbidden();
        $this->loginInspector();
        foreach (['', 'unknown-district'] as $code) {
            config(['caneguard.pilot_district_code' => $code]);
            $this->postJson(self::ENDPOINT, $this->payload())->assertForbidden();
        }
        $this->assertDatabaseCount('field_surveys', 0);
    }

    public function test_outside_district_has_a_displayable_field_error_even_on_replay(): void
    {
        $this->loginInspector();
        $payload = $this->payload();
        $this->postJson(self::ENDPOINT, $payload)->assertCreated();
        $payload['district_code'] = 'foreign';
        $this->postJson(self::ENDPOINT, $payload)->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR')
            ->assertJsonPath('errors.district_code.0', 'The district code must match the configured pilot district.');
        $this->assertDatabaseCount('field_surveys', 1);
    }

    public function test_migration_rollback_and_reapplication_preserve_the_walked_boundary(): void
    {
        $this->loginInspector();
        $this->postJson(self::ENDPOINT, $this->payload())->assertCreated();
        $before = FieldSurvey::query()->sole()->getRawOriginal();
        $migration = require database_path('migrations/2026_10_05_000000_create_field_surveys_table.php');
        $migration->down();
        $migration->up();
        $this->assertSame($before, FieldSurvey::query()->sole()->getRawOriginal());
    }

    public function test_required_fields_all_have_displayable_validation_errors(): void
    {
        $this->loginInspector();
        $this->postJson(self::ENDPOINT, [])->assertUnprocessable()->assertJsonValidationErrors([
            'client_uuid', 'polygon', 'area_sqm', 'captured_at', 'district_code',
        ]);
        $this->assertDatabaseCount('field_surveys', 0);
    }

    #[DataProvider('invalidFields')]
    public function test_invalid_metadata_is_rejected_per_field(string $field, mixed $value): void
    {
        $this->loginInspector();
        $payload = $this->payload();
        $payload[$field] = $value;
        $this->postJson(self::ENDPOINT, $payload)->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertDatabaseCount('field_surveys', 0);
    }

    public static function invalidFields(): array
    {
        return [
            ['client_uuid', 'not-a-uuid'], ['area_sqm', 0], ['area_sqm', -1],
            ['area_sqm', '12.5'], ['area_sqm', true], ['area_sqm', []],
            ['captured_at', '2026-10-04'], ['captured_at', '2026-10-04T10:00:00'],
            ['captured_at', '2026-02-30T10:00:00Z'], ['captured_at', 'not-a-date'],
            ['captured_at', '0001-01-01T10:00:00Z'], ['captured_at', '9999-12-31T23:59:59-08:00'],
            ['district_code', 'foreign'], ['district_code', ['test-pilot']],
            ['polygon', 'not-geojson'], ['polygon', ['type' => 'MultiPolygon', 'coordinates' => []]],
            ['polygon', ['type' => 'Polygon', 'coordinates' => []]],
            ['polygon', ['type' => 'Polygon', 'coordinates' => [[[0, 0], [1, 0], [0, 1]]]]],
            ['polygon', ['type' => 'Polygon', 'coordinates' => [[[0, 0], [1, 0], [0, 1], [2, 2]]]]],
            ['polygon', ['type' => 'Polygon', 'coordinates' => [[[0, 0], [1, 0], [1, 0], [0, 0]]]]],
            ['polygon', ['type' => 'Polygon', 'coordinates' => [[[0, 0], [181, 0], [0, 1], [0, 0]]]]],
            ['polygon', ['type' => 'Polygon', 'coordinates' => [[[0, 0], [1, 0], [0, -91], [0, 0]]]]],
            ['polygon', ['type' => 'Polygon', 'coordinates' => [[[0, 0], ['1', 0], [0, 1], [0, 0]]]]],
            ['polygon', ['type' => 'Polygon', 'coordinates' => [[[0, 0], [1, 0, 50], [0, 1], [0, 0]]]]],
            ['polygon', ['type' => 'Polygon', 'coordinates' => [[[0, 0], [1, 0], [0, 1], [0, 0]], []]]],
            ['polygon', ['type' => 'Polygon', 'coordinates' => [array_fill(0, 10001, [0, 0])]]],
        ];
    }

    private function loginInspector(array $abilities = ['report:submit']): User
    {
        Auth::forgetGuards();
        $inspector = User::factory()->inDistrict($this->pilotDistrict())->create();
        $this->withToken($inspector->createToken('Pilot survey phone', $abilities)->plainTextToken);

        return $inspector;
    }

    private function payload(): array
    {
        return [
            'client_uuid' => (string) Str::uuid(),
            'polygon' => ['type' => 'Polygon', 'coordinates' => [[
                [122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7],
            ]]],
            'area_sqm' => 6075.123,
            'captured_at' => '2026-10-04T10:30:12.123456+08:00',
            'district_code' => 'test-pilot',
        ];
    }

    private function affectedPolygon(): array
    {
        return ['type' => 'Polygon', 'coordinates' => [[
            [122.95, 10.7], [122.9502, 10.7], [122.95, 10.7002], [122.95, 10.7],
        ]]];
    }

    private function largeAffectedPolygon(float $offset = 0.0): array
    {
        $ring = [];
        for ($index = 0; $index < 5000; $index++) {
            $angle = 2 * M_PI * $index / 5000;
            $ring[] = [122.96 + $offset + 0.0001 * cos($angle), 10.71 + 0.0001 * sin($angle)];
        }
        $ring[] = $ring[0];

        return ['type' => 'Polygon', 'coordinates' => [$ring]];
    }
}
