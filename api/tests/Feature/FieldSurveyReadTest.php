<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\FieldSurvey;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class FieldSurveyReadTest extends TestCase
{
    use RefreshDatabase;

    private const ENDPOINT = '/api/v1/field-surveys';

    public function test_office_reviewer_receives_private_geojson_with_stored_rings_and_limited_inspector_data(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create(['name' => 'Rosa Inspector']);
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $polygon = [
            'type' => 'Polygon',
            'coordinates' => [
                [[122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7]],
                [[122.9501, 10.7001], [122.9502, 10.7001], [122.9501, 10.7002], [122.9501, 10.7001]],
            ],
        ];
        $survey = $this->storeSurvey($district, $inspector, [
            'polygon' => $polygon,
            'area_sqm' => 6075.123456789,
            'captured_at' => CarbonImmutable::parse('2026-10-04T02:30:12.123456Z'),
        ]);

        $response = $this->actingAs($reviewer, 'web')->getJson(self::ENDPOINT)->assertOk();

        $feature = $response->json('features.0');
        $this->assertSame(['type', 'id', 'geometry', 'properties'], array_keys($feature));
        $this->assertSame([
            'id', 'captured_at', 'area_sqm', 'area_source', 'inspector',
        ], array_keys($feature['properties']));
        $this->assertSame('FeatureCollection', $response->json('type'));
        $this->assertSame((string) $survey->id, $feature['id']);
        $this->assertSame($polygon, $feature['geometry']);
        $this->assertSame($survey->id, $feature['properties']['id']);
        $this->assertSame('2026-10-04T02:30:12.123456Z', $feature['properties']['captured_at']);
        $this->assertSame((float) $survey->area_sqm, $feature['properties']['area_sqm']);
        $this->assertSame('device_reported', $feature['properties']['area_source']);
        $this->assertSame([
            'uuid' => $inspector->uuid,
            'name' => $inspector->name,
        ], $feature['properties']['inspector']);
        $this->assertSame([
            'total_count' => 1,
            'returned_count' => 1,
            'limit' => 100,
            'truncated' => false,
            'page' => 1,
            'page_count' => 1,
        ], $response->json('metadata'));
        $this->assertStringContainsString('private', strtolower((string) $response->headers->get('Cache-Control')));
        $this->assertStringContainsString('no-store', strtolower((string) $response->headers->get('Cache-Control')));
        $response->assertJsonMissingPath('features.0.properties.client_uuid')
            ->assertJsonMissingPath('features.0.properties.waypoints_json')
            ->assertJsonMissingPath('features.0.properties.inspector.email');
    }

    public function test_results_are_pilot_district_scoped_and_missing_pilot_id_fails_closed(): void
    {
        $pilot = $this->pilotDistrict();
        $foreign = District::query()->create(['code' => 'foreign-pilot', 'name' => 'Foreign pilot']);
        $inspector = User::factory()->inDistrict($pilot)->create();
        $pilotSurvey = $this->storeSurvey($pilot, $inspector);
        $this->storeSurvey($foreign, $inspector);
        $reviewer = User::factory()->inDistrict($pilot)->reviewer()->create();

        $this->actingAs($reviewer, 'web')->getJson(self::ENDPOINT)->assertOk()
            ->assertJsonCount(1, 'features')
            ->assertJsonPath('features.0.properties.id', $pilotSurvey->id)
            ->assertJsonPath('metadata.total_count', 1);

        config(['caneguard.pilot_district_code' => 'unknown-pilot']);
        $this->getJson(self::ENDPOINT)->assertOk()
            ->assertJsonCount(0, 'features')
            ->assertJsonPath('metadata.total_count', 0)
            ->assertJsonPath('metadata.returned_count', 0)
            ->assertJsonPath('metadata.truncated', false);
    }

    public function test_newest_first_uses_id_as_a_stable_tiebreaker_and_reports_truncation(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create();
        $old = $this->storeSurvey($district, $inspector, [
            'captured_at' => CarbonImmutable::parse('2026-10-01T00:00:00Z'),
        ]);
        $tieFirst = $this->storeSurvey($district, $inspector, [
            'captured_at' => CarbonImmutable::parse('2026-10-02T00:00:00Z'),
        ]);
        $tieSecond = $this->storeSurvey($district, $inspector, [
            'captured_at' => CarbonImmutable::parse('2026-10-02T00:00:00Z'),
        ]);
        $new = $this->storeSurvey($district, $inspector, [
            'captured_at' => CarbonImmutable::parse('2026-10-03T00:00:00Z'),
        ]);
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();

        $response = $this->actingAs($reviewer, 'web')->getJson(self::ENDPOINT.'?limit=2')->assertOk();

        $this->assertSame([$new->id, $tieSecond->id], array_map(
            fn (array $feature): int => $feature['properties']['id'],
            $response->json('features'),
        ));
        $this->assertSame([
            'total_count' => 4,
            'returned_count' => 2,
            'limit' => 2,
            'truncated' => true,
            'page' => 1,
            'page_count' => 2,
        ], $response->json('metadata'));
        $this->assertGreaterThan($tieFirst->id, $tieSecond->id);
        $this->assertGreaterThan($old->id, $tieFirst->id);
    }

    public function test_default_limit_is_100_and_maximum_limit_is_250(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create();
        for ($index = 0; $index < 101; $index++) {
            $this->storeSurvey($district, $inspector, [
                'captured_at' => CarbonImmutable::parse('2026-10-01T00:00:00Z')->addSeconds($index),
            ]);
        }
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->actingAs($reviewer, 'web');

        $this->getJson(self::ENDPOINT)->assertOk()
            ->assertJsonCount(100, 'features')
            ->assertJsonPath('metadata.total_count', 101)
            ->assertJsonPath('metadata.returned_count', 100)
            ->assertJsonPath('metadata.limit', 100)
            ->assertJsonPath('metadata.truncated', true);
        $this->getJson(self::ENDPOINT.'?limit=250')->assertOk()
            ->assertJsonCount(101, 'features')
            ->assertJsonPath('metadata.total_count', 101)
            ->assertJsonPath('metadata.returned_count', 101)
            ->assertJsonPath('metadata.limit', 250)
            ->assertJsonPath('metadata.truncated', false);
    }

    public function test_paging_reaches_a_boundary_beyond_the_first_page_without_widening_the_read(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create(['name' => 'Rosa Inspector']);
        $oldest = null;
        for ($index = 0; $index < 101; $index++) {
            $survey = $this->storeSurvey($district, $inspector, [
                'captured_at' => CarbonImmutable::parse('2026-09-01T00:00:00Z')->addSeconds($index),
            ]);
            $oldest = $index === 0 ? $survey : $oldest;
        }
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->actingAs($reviewer, 'web');

        $first = $this->getJson(self::ENDPOINT.'?limit=100')->assertOk();
        $first->assertJsonCount(100, 'features')
            ->assertJsonPath('metadata.page', 1)
            ->assertJsonPath('metadata.page_count', 2)
            ->assertJsonPath('metadata.truncated', true);

        $second = $this->getJson(self::ENDPOINT.'?limit=100&page=2')->assertOk();
        $second->assertJsonCount(1, 'features')
            ->assertJsonPath('metadata.page', 2)
            ->assertJsonPath('metadata.truncated', false);
        $this->assertSame($oldest->id, $second->json('features.0.properties.id'));

        // A page past the end is clamped rather than returning an empty window.
        $this->getJson(self::ENDPOINT.'?limit=100&page=99')->assertOk()
            ->assertJsonPath('metadata.page', 2)
            ->assertJsonCount(1, 'features');
    }

    public function test_search_finds_an_older_boundary_by_id_date_or_inspector_name(): void
    {
        $district = $this->pilotDistrict();
        $rosa = User::factory()->inDistrict($district)->create(['name' => 'Rosa Inspector']);
        $mateo = User::factory()->inDistrict($district)->create(['name' => 'Mateo Inspector']);
        $target = $this->storeSurvey($district, $mateo, [
            'captured_at' => CarbonImmutable::parse('2026-08-11T04:00:00Z'),
        ]);
        for ($index = 0; $index < 120; $index++) {
            $this->storeSurvey($district, $rosa, [
                'captured_at' => CarbonImmutable::parse('2026-10-01T00:00:00Z')->addSeconds($index),
            ]);
        }
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->actingAs($reviewer, 'web');

        $byId = $this->getJson(self::ENDPOINT.'?search='.$target->id)->assertOk();
        $byId->assertJsonCount(1, 'features')->assertJsonPath('features.0.properties.id', $target->id);

        $byName = $this->getJson(self::ENDPOINT.'?'.http_build_query(['search' => 'Mateo']))->assertOk();
        $byName->assertJsonCount(1, 'features')->assertJsonPath('features.0.properties.id', $target->id);

        $byDate = $this->getJson(self::ENDPOINT.'?search=2026-08-11')->assertOk();
        $byDate->assertJsonCount(1, 'features')->assertJsonPath('metadata.total_count', 1);

        $this->getJson(self::ENDPOINT.'?'.http_build_query(['search' => 'nobody']))
            ->assertOk()->assertJsonCount(0, 'features')->assertJsonPath('metadata.total_count', 0);
    }

    public function test_capture_date_search_uses_the_manila_calendar_day_reviewers_see(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create(['name' => 'Rosa Inspector']);
        // 2026-08-11T20:00:00Z is 04:00 on 12 August in Asia/Manila.
        $afterMidnight = $this->storeSurvey($district, $inspector, [
            'captured_at' => CarbonImmutable::parse('2026-08-11T20:00:00Z'),
        ]);
        // 2026-08-12T15:00:00Z is 23:00 on 12 August in Asia/Manila.
        $lateEvening = $this->storeSurvey($district, $inspector, [
            'captured_at' => CarbonImmutable::parse('2026-08-12T15:00:00Z'),
        ]);
        // 2026-08-12T16:30:00Z is 00:30 on 13 August in Asia/Manila.
        $nextManilaDay = $this->storeSurvey($district, $inspector, [
            'captured_at' => CarbonImmutable::parse('2026-08-12T16:30:00Z'),
        ]);
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->actingAs($reviewer, 'web');

        $onShownDate = $this->getJson(self::ENDPOINT.'?search=2026-08-12')->assertOk();
        $found = array_map(static fn (array $feature): int => $feature['properties']['id'], $onShownDate->json('features'));
        $this->assertContains($afterMidnight->id, $found);
        $this->assertContains($lateEvening->id, $found);
        $this->assertNotContains($nextManilaDay->id, $found);

        $previousDay = $this->getJson(self::ENDPOINT.'?search=2026-08-11')->assertOk();
        $this->assertSame(0, $previousDay->json('metadata.total_count'));
    }

    public function test_an_impossible_capture_date_matches_nothing_instead_of_rolling_into_another_day(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create(['name' => 'Rosa Inspector']);
        // 2026-07-01T04:00:00Z is 12:00 on 1 July in Asia/Manila.
        $firstOfJuly = $this->storeSurvey($district, $inspector, [
            'captured_at' => CarbonImmutable::parse('2026-07-01T04:00:00Z'),
        ]);
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->actingAs($reviewer, 'web');

        $realDate = $this->getJson(self::ENDPOINT.'?search=2026-07-01')->assertOk();
        $this->assertContains(
            $firstOfJuly->id,
            array_map(static fn (array $feature): int => $feature['properties']['id'], $realDate->json('features')),
        );

        // 31 June does not exist; PHP would otherwise read it as 1 July.
        $this->getJson(self::ENDPOINT.'?search=2026-06-31')
            ->assertOk()
            ->assertJsonCount(0, 'features')
            ->assertJsonPath('metadata.total_count', 0);
        $this->getJson(self::ENDPOINT.'?search=2026-13-45')
            ->assertOk()
            ->assertJsonCount(0, 'features')
            ->assertJsonPath('metadata.total_count', 0);
    }

    public function test_search_terms_cannot_inject_like_wildcards(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create(['name' => 'Rosa Inspector']);
        $this->storeSurvey($district, $inspector);
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->actingAs($reviewer, 'web');

        $this->getJson(self::ENDPOINT.'?'.http_build_query(['search' => '%']))
            ->assertOk()->assertJsonPath('metadata.total_count', 0);
        $this->getJson(self::ENDPOINT.'?'.http_build_query(['search' => '_']))
            ->assertOk()->assertJsonPath('metadata.total_count', 0);
    }

    public function test_invalid_page_and_search_use_the_standard_validation_envelope(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $this->actingAs($reviewer, 'web');

        $this->getJson(self::ENDPOINT.'?page=0')->assertUnprocessable()
            ->assertJsonStructure(['message', 'code', 'errors' => ['page']]);
        $this->getJson(self::ENDPOINT.'?'.http_build_query(['search' => str_repeat('a', 61)]))
            ->assertUnprocessable()
            ->assertJsonStructure(['message', 'code', 'errors' => ['search']]);
    }

    #[DataProvider('invalidLimits')]
    public function test_invalid_limits_use_the_standard_validation_envelope(mixed $limit): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();

        $this->actingAs($reviewer, 'web')->getJson(self::ENDPOINT.'?'.http_build_query(['limit' => $limit]))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR')
            ->assertJsonStructure(['message', 'code', 'errors' => ['limit']]);
    }

    public static function invalidLimits(): array
    {
        return [
            'zero' => [0],
            'negative' => [-1],
            'over maximum' => [251],
            'fraction' => ['1.5'],
            'not an integer' => ['many'],
        ];
    }

    public function test_unauthenticated_and_non_office_sessions_cannot_read(): void
    {
        $this->getJson(self::ENDPOINT)->assertUnauthorized();
        $district = $this->pilotDistrict();

        foreach ([User::ROLE_FIELD_REPORTER, User::ROLE_FARMER] as $role) {
            Auth::forgetGuards();
            $user = User::factory()->inDistrict($district)->create(['role' => $role]);
            $this->actingAs($user, 'web')->getJson(self::ENDPOINT)->assertForbidden();
        }
    }

    public function test_mobile_bearer_token_is_rejected_even_for_a_field_reporter(): void
    {
        $district = $this->pilotDistrict();
        $reporter = User::factory()->inDistrict($district)->create();
        $token = $reporter->createToken('field phone', ['report:submit']);

        $this->withToken($token->plainTextToken)->getJson(self::ENDPOINT)->assertForbidden();
    }

    public function test_reviewer_and_admin_web_sessions_can_read(): void
    {
        $district = $this->pilotDistrict();

        foreach ([User::ROLE_REVIEWER, User::ROLE_ADMIN] as $role) {
            Auth::forgetGuards();
            $user = User::factory()->inDistrict($district)->create(['role' => $role]);
            $this->actingAs($user, 'web')->getJson(self::ENDPOINT)->assertOk()
                ->assertJsonPath('type', 'FeatureCollection');
        }
    }

    public function test_survey_read_does_not_add_boundaries_to_report_map_or_validation_queue(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create();
        $this->storeSurvey($district, $inspector);
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();

        $this->actingAs($reviewer, 'web')->getJson('/api/v1/reports/map')->assertOk()
            ->assertJsonCount(0, 'features')->assertJsonPath('metadata.total_count', 0);
        $this->getJson('/api/v1/reports/field-validation-queue')->assertOk()
            ->assertJsonPath('data.count', 0);
    }

    public function test_route_is_named_office_only_and_throttled(): void
    {
        $route = Route::getRoutes()->getByName('api.v1.field-surveys.index');

        $this->assertNotNull($route);
        $middleware = $route->gatherMiddleware();
        $this->assertContains('office.access', $middleware);
        $this->assertContains('throttle:30,1', $middleware);
    }

    private function storeSurvey(District $district, User $inspector, array $attributes = []): FieldSurvey
    {
        return FieldSurvey::query()->create(array_merge([
            'client_uuid' => (string) Str::uuid(),
            'inspector_id' => $inspector->id,
            'district_id' => $district->id,
            'polygon' => [
                'type' => 'Polygon',
                'coordinates' => [[
                    [122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7],
                ]],
            ],
            'area_sqm' => 6075.123456789,
            'captured_at' => CarbonImmutable::parse('2026-10-04T02:30:12.123456Z'),
        ], $attributes));
    }
}
