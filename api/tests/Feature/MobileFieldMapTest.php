<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\FieldSurvey;
use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileFieldMapTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    public function test_ingest_keeps_an_optional_name_and_the_map_whose_outline_was_reused(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->fieldReporter()->create();
        $source = $this->survey($district, $inspector);
        Sanctum::actingAs($inspector, ['report:submit']);

        $this->postJson('/api/v1/mobile/field-surveys', $this->payload([
            'label' => '  North lot  ',
            'outline_from_survey_id' => $source->id,
        ]))->assertCreated();
        $this->postJson('/api/v1/mobile/field-surveys', $this->payload(['label' => '   ']))->assertCreated();
        $this->postJson('/api/v1/mobile/field-surveys', $this->payload())->assertCreated();

        $surveys = FieldSurvey::query()->where('id', '!=', $source->id)->orderBy('id')->get();
        $this->assertSame('North lot', $surveys[0]->label);
        $this->assertSame($source->id, $surveys[0]->outline_from_survey_id);
        $this->assertNull($surveys[1]->label);
        $this->assertNull($surveys[2]->label);
        $this->assertNull($surveys[2]->outline_from_survey_id);
    }

    public function test_ingest_refuses_an_overlong_name_and_an_outline_source_that_does_not_exist_here(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->fieldReporter()->create();
        $elsewhere = $this->survey(District::query()->create(['code' => 'other-district', 'name' => 'Other district']), User::factory()->create());
        Sanctum::actingAs($inspector, ['report:submit']);

        $this->postJson('/api/v1/mobile/field-surveys', $this->payload(['label' => str_repeat('a', 61)]))
            ->assertUnprocessable()->assertJsonValidationErrors('label');
        $this->postJson('/api/v1/mobile/field-surveys', $this->payload(['outline_from_survey_id' => $elsewhere->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('outline_from_survey_id');
        $this->postJson('/api/v1/mobile/field-surveys', $this->payload(['outline_from_survey_id' => 999_999]))
            ->assertUnprocessable()->assertJsonValidationErrors('outline_from_survey_id');
        $this->assertDatabaseCount('field_surveys', 1);
    }

    public function test_office_reads_show_the_name_and_where_the_outline_came_from(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->fieldReporter()->create();
        $reviewer = User::factory()->reviewer()->create();
        $source = $this->survey($district, $inspector);
        $reused = $this->survey($district, $inspector, ['label' => 'North lot', 'outline_from_survey_id' => $source->id]);
        $report = Report::factory()->inDistrict($district)->create(['field_survey_client_uuid' => $reused->client_uuid]);
        $report->affectedFieldSurveys()->attach($reused->id);

        $this->actingAs($reviewer, 'web');
        $this->getJson("/api/v1/reports/{$report->uuid}")->assertOk()
            ->assertJsonPath('data.affected_fields.0.label', 'North lot')
            ->assertJsonPath('data.affected_fields.0.outline_from_survey_id', $source->id)
            ->assertJsonPath('data.inspector_attachment.field_survey.label', 'North lot');
        $feature = collect($this->getJson('/api/v1/field-surveys')->assertOk()->json('features'))
            ->firstWhere('properties.id', $reused->id);
        $this->assertSame('North lot', $feature['properties']['label']);
        $this->assertSame($source->id, $feature['properties']['outline_from_survey_id']);
    }

    public function test_the_phone_learns_whether_the_office_confirmed_each_of_its_maps(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->fieldReporter()->create();
        $other = User::factory()->inDistrict($district)->fieldReporter()->create();
        $confirmed = $this->survey($district, $inspector);
        $replaced = $this->survey($district, $inspector);
        $waiting = $this->survey($district, $inspector);
        $unattached = $this->survey($district, $inspector);
        $theirs = $this->survey($district, $other);
        $rightMap = $this->survey($district, $other);
        foreach ([$confirmed, $replaced, $waiting, $theirs] as $survey) {
            Report::factory()->inDistrict($district)->create(['field_survey_client_uuid' => $survey->client_uuid]);
        }
        Report::query()->where('field_survey_client_uuid', $confirmed->client_uuid)->sole()
            ->affectedFieldSurveys()->attach($confirmed->id);
        Report::query()->where('field_survey_client_uuid', $replaced->client_uuid)->sole()
            ->affectedFieldSurveys()->attach($rightMap->id);

        Sanctum::actingAs($inspector, ['report:status']);
        $rows = collect($this->getJson('/api/v1/mobile/field-surveys/office-status')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')->json('data'))
            ->pluck('verdict', 'client_uuid');

        $this->assertEquals([
            $confirmed->client_uuid => 'confirmed',
            $replaced->client_uuid => 'wrong_field',
            $waiting->client_uuid => 'pending',
        ], $rows->all());
        $this->assertArrayNotHasKey($unattached->client_uuid, $rows->all());
        $this->assertArrayNotHasKey($theirs->client_uuid, $rows->all());
    }

    public function test_an_assigned_inspector_reads_only_that_cases_map_and_nobody_else_can(): void
    {
        $district = $this->pilotDistrict();
        $original = User::factory()->inDistrict($district)->fieldReporter()->create(['name' => 'Ana Original']);
        $assignee = User::factory()->inDistrict($district)->fieldReporter()->create();
        $stranger = User::factory()->inDistrict($district)->fieldReporter()->create();
        $reviewer = User::factory()->inDistrict($district)->reviewer()->create();
        $map = $this->survey($district, $original, ['label' => 'North lot']);
        $report = Report::factory()->inDistrict($district)->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
            'field_survey_client_uuid' => $map->client_uuid,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => $reviewer->getKey(),
        ]);
        $url = "/api/v1/mobile/assignments/{$assignment->uuid}/field-map";

        Sanctum::actingAs($assignee, ['assignment:read']);
        $this->getJson($url)->assertOk()
            ->assertJsonPath('data.field_survey_id', $map->id)
            ->assertJsonPath('data.source', 'attached')
            ->assertJsonPath('data.label', 'North lot')
            ->assertJsonPath('data.inspector.name', 'Ana Original')
            ->assertJsonPath('data.geometry.type', 'Polygon')
            ->assertJsonMissingPath('data.client_uuid');

        // Once the office confirms a map for the case, that one is the case's map.
        $confirmed = $this->survey($district, $original);
        $report->affectedFieldSurveys()->attach($confirmed->id);
        $this->getJson($url)->assertOk()
            ->assertJsonPath('data.field_survey_id', $confirmed->id)
            ->assertJsonPath('data.source', 'confirmed');

        Sanctum::actingAs($stranger, ['assignment:read']);
        $this->getJson($url)->assertForbidden();
    }

    public function test_a_case_with_no_map_answers_null(): void
    {
        $district = $this->pilotDistrict();
        $assignee = User::factory()->inDistrict($district)->fieldReporter()->create();
        $report = Report::factory()->inDistrict($district)->create([
            'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
        ]);
        $assignment = FieldValidationAssignment::factory()->create([
            'report_id' => $report->getKey(),
            'assignee_id' => $assignee->getKey(),
            'assigned_by_id' => User::factory()->inDistrict($district)->reviewer()->create()->getKey(),
        ]);

        Sanctum::actingAs($assignee, ['assignment:read']);
        $this->getJson("/api/v1/mobile/assignments/{$assignment->uuid}/field-map")
            ->assertOk()->assertExactJson(['data' => null]);
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function survey(District $district, User $inspector, array $extra = []): FieldSurvey
    {
        return FieldSurvey::query()->create($extra + [
            'client_uuid' => (string) Str::uuid(),
            'inspector_id' => $inspector->id,
            'district_id' => $district->id,
            'polygon' => ['type' => 'Polygon', 'coordinates' => [[
                [122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7],
            ]]],
            'area_sqm' => 6075.12,
            'captured_at' => '2026-10-04 02:30:12.123456',
        ]);
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function payload(array $extra = []): array
    {
        return $extra + [
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
