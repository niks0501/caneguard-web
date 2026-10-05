<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\DistrictMembership;
use App\Models\FieldSurvey;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
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
        $receipt->assertExactJson(['id' => $survey->id, 'status' => 'kept']);
        $this->assertSame($payload['polygon'], $survey->polygon);
        $this->assertSame($payload['area_sqm'], $survey->area_sqm);
        $this->assertSame('2026-10-04T02:30:12.123456Z', $survey->captured_at->toISOString());
        $this->assertSame($inspector->id, $survey->inspector_id);
        $this->assertSame($district->id, $survey->district_id);
        $this->assertDatabaseCount('reports', 0);
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
        $this->postJson(self::ENDPOINT, $payload)->assertCreated()->assertExactJson(['id' => $id, 'status' => 'kept']);
        $this->assertDatabaseCount('field_surveys', 1);
        $this->assertSame($before, FieldSurvey::findOrFail($id)->getRawOriginal());
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
}
