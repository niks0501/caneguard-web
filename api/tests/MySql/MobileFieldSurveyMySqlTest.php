<?php

namespace Tests\MySql;

use App\Models\District;
use App\Models\FieldSurvey;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class MobileFieldSurveyMySqlTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/^firstmate_[a-z0-9_]+$/D', DB::connection()->getDatabaseName());
    }

    public function test_json_precision_utc_microseconds_and_idempotency_survive_mysql_reload(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create();
        $payload = $this->payload();
        $this->withToken($inspector->createToken('survey', ['report:submit'])->plainTextToken);
        $id = $this->postJson('/api/v1/mobile/field-surveys', $payload)->assertCreated()->json('id');
        $survey = FieldSurvey::findOrFail($id);
        $this->assertSame($payload['polygon'], $survey->polygon);
        $this->assertSame($payload['area_sqm'], $survey->area_sqm);
        $this->assertSame('2026-10-04T02:30:12.123456Z', $survey->captured_at->toISOString());
        $this->assertSame($district->id, $survey->district_id);
        $this->assertSame($inspector->id, $survey->inspector_id);
        $before = $survey->getRawOriginal();
        $payload['area_sqm'] = 1;
        $payload['client_uuid'] = strtoupper($payload['client_uuid']);
        Auth::forgetGuards();
        $this->postJson('/api/v1/mobile/field-surveys', $payload)->assertCreated()
            ->assertExactJson(['id' => $id, 'status' => 'kept']);
        $this->assertSame($before, $survey->fresh()->getRawOriginal());
        $this->assertSame(1, FieldSurvey::query()->where('client_uuid', $payload['client_uuid'])->count());

        // A second insert must fail at the engine, not only at the HTTP validation layer.
        $this->expectException(UniqueConstraintViolationException::class);
        FieldSurvey::query()->create([
            'client_uuid' => strtolower($payload['client_uuid']),
            'inspector_id' => $inspector->id,
            'district_id' => $district->id,
            'polygon' => $payload['polygon'],
            'area_sqm' => $payload['area_sqm'],
            'captured_at' => now(),
        ]);
    }

    public function test_mysql_uuid_collision_and_foreign_scope_never_leak_or_duplicate_a_receipt(): void
    {
        $district = $this->pilotDistrict();
        $owner = User::factory()->inDistrict($district)->create();
        $payload = $this->payload();
        $this->withToken($owner->createToken('owner', ['report:submit'])->plainTextToken);
        $this->postJson('/api/v1/mobile/field-surveys', $payload)->assertCreated();
        $other = User::factory()->inDistrict($district)->create();
        Auth::forgetGuards();
        $this->withToken($other->createToken('other', ['report:submit'])->plainTextToken);
        $this->postJson('/api/v1/mobile/field-surveys', $payload)->assertUnprocessable()
            ->assertJsonValidationErrors('client_uuid')->assertJsonMissingPath('id');
        $payload['district_code'] = 'foreign';
        $this->postJson('/api/v1/mobile/field-surveys', $payload)->assertUnprocessable()
            ->assertJsonValidationErrors('district_code');
        $foreign = District::query()->create(['code' => 'foreign', 'name' => 'Foreign']);
        $foreignInspector = User::factory()->inDistrict($foreign)->create();
        Auth::forgetGuards();
        $this->withToken($foreignInspector->createToken('foreign', ['*'])->plainTextToken);
        $this->postJson('/api/v1/mobile/field-surveys', $payload)->assertForbidden();
        $this->assertSame(1, FieldSurvey::query()->where('client_uuid', $payload['client_uuid'])->count());
    }

    private function payload(): array
    {
        return [
            'client_uuid' => (string) Str::uuid(),
            'polygon' => ['type' => 'Polygon', 'coordinates' => [[
                [122.95000000000002, 10.70000000000001],
                [122.951, 10.7], [122.95, 10.701],
                [122.95000000000002, 10.70000000000001],
            ]]],
            'area_sqm' => 6075.123456789,
            'captured_at' => '2026-10-04T10:30:12.123456+08:00',
            'district_code' => 'test-pilot',
        ];
    }
}
