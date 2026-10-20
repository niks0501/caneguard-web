<?php

namespace Tests\Feature;

use App\Models\District;
use App\Models\FieldSurvey;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class ReportAffectedFieldSurveyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPilotFixtures();
    }

    public function test_office_can_link_multiple_device_surveys_to_one_case_with_office_loss_rates(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create(['name' => 'Field Inspector']);
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->inDistrict($district)->create(['lock_version' => 4]);
        $first = $this->storeSurvey($district, $inspector, 6075.12);
        $second = $this->storeSurvey($district, $inspector, 8120.5);

        $response = $this->actingAs($reviewer, 'web')->putJson(
            "/api/v1/reports/{$report->uuid}/affected-fields",
            [
                'expected_version' => 4,
                'affected_fields' => [
                    ['field_survey_id' => $first->id, 'loss_rate_percent' => 18.5],
                    ['field_survey_id' => $second->id, 'loss_rate_percent' => 42],
                ],
            ],
        )->assertOk()
            ->assertJsonPath('data.version', 5)
            ->assertJsonPath('data.affected_fields.0.field_survey_id', $first->id)
            ->assertJsonPath('data.affected_fields.0.area_sqm', 6075.12)
            ->assertJsonPath('data.affected_fields.0.area_source', 'device_reported')
            ->assertJsonPath('data.affected_fields.0.loss_rate_percent', 18.5)
            ->assertJsonPath('data.affected_fields.1.field_survey_id', $second->id)
            ->assertJsonPath('data.affected_fields.1.loss_rate_percent', 42);

        $response->assertJsonMissingPath('data.affected_area_sqm');
        $this->assertDatabaseHas('report_affected_field_surveys', [
            'report_id' => $report->id,
            'field_survey_id' => $first->id,
            'loss_rate_percent' => 18.5,
        ]);

        $this->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonCount(2, 'data.affected_fields')
            ->assertJsonPath('data.affected_fields.0.geometry.type', 'Polygon')
            ->assertJsonPath('data.affected_fields.0.area_source', 'device_reported')
            ->assertJsonPath('data.affected_fields.1.loss_rate_percent', 42)
            ->assertJsonPath('data.version', 5);

        $this->patchJson("/api/v1/reports/{$report->uuid}/review", [
            'expected_version' => 5,
            'notes' => 'The affected field boundaries were checked.',
        ])->assertOk()
            ->assertJsonCount(2, 'data.affected_fields')
            ->assertJsonPath('data.version', 6);
    }

    public function test_linkage_requires_distinct_pilot_boundaries_and_office_loss_rates(): void
    {
        $pilot = $this->pilotDistrict();
        $foreign = District::query()->create(['code' => 'foreign-field', 'name' => 'Foreign field']);
        $inspector = User::factory()->inDistrict($pilot)->create();
        $report = Report::factory()->inDistrict($pilot)->create();
        $pilotSurvey = $this->storeSurvey($pilot, $inspector);
        $foreignSurvey = $this->storeSurvey($foreign, $inspector);
        $reviewer = User::factory()->reviewer()->create();

        $this->actingAs($reviewer, 'web')->putJson(
            "/api/v1/reports/{$report->uuid}/affected-fields",
            [
                'expected_version' => 0,
                'affected_fields' => [
                    ['field_survey_id' => $pilotSurvey->id, 'loss_rate_percent' => 12],
                    ['field_survey_id' => $pilotSurvey->id, 'loss_rate_percent' => 13],
                ],
            ],
        )->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['affected_fields.1.field_survey_id']]);

        $this->putJson(
            "/api/v1/reports/{$report->uuid}/affected-fields",
            [
                'expected_version' => 0,
                'affected_fields' => [
                    ['field_survey_id' => $foreignSurvey->id, 'loss_rate_percent' => 12],
                ],
            ],
        )->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['affected_fields.0.field_survey_id']]);

        $this->putJson(
            "/api/v1/reports/{$report->uuid}/affected-fields",
            [
                'expected_version' => 0,
                'affected_fields' => [
                    ['field_survey_id' => $pilotSurvey->id, 'loss_rate_percent' => 100.01],
                ],
            ],
        )->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['affected_fields.0.loss_rate_percent']]);

        $this->assertDatabaseCount('report_affected_field_surveys', 0);
    }

    public function test_stale_versions_conflict_and_an_empty_set_removes_only_this_cases_links(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->inDistrict($district)->create();
        $otherReport = Report::factory()->inDistrict($district)->create();
        $first = $this->storeSurvey($district, $inspector);
        $third = $this->storeSurvey($district, $inspector);
        $report->affectedFieldSurveys()->attach($first->id, ['loss_rate_percent' => 20]);
        $otherReport->affectedFieldSurveys()->attach($first->id, ['loss_rate_percent' => 35]);

        $this->actingAs($reviewer, 'web')->putJson(
            "/api/v1/reports/{$report->uuid}/affected-fields",
            [
                'expected_version' => 1,
                'affected_fields' => [
                    ['field_survey_id' => $third->id, 'loss_rate_percent' => 25],
                ],
            ],
        )->assertStatus(409);
        $this->assertDatabaseHas('report_affected_field_surveys', [
            'report_id' => $report->id,
            'field_survey_id' => $first->id,
        ]);

        $this->putJson(
            "/api/v1/reports/{$report->uuid}/affected-fields",
            ['expected_version' => 0, 'affected_fields' => []],
        )->assertOk()
            ->assertJsonCount(0, 'data.affected_fields')
            ->assertJsonPath('data.version', 1);

        $this->assertDatabaseMissing('report_affected_field_surveys', [
            'report_id' => $report->id,
            'field_survey_id' => $first->id,
        ]);
        $this->assertDatabaseHas('report_affected_field_surveys', [
            'report_id' => $otherReport->id,
            'field_survey_id' => $first->id,
        ]);
    }

    public function test_only_office_sessions_can_update_case_polygon_links(): void
    {
        $district = $this->pilotDistrict();
        $report = Report::factory()->inDistrict($district)->create();
        $payload = ['expected_version' => 0, 'affected_fields' => []];

        $this->putJson("/api/v1/reports/{$report->uuid}/affected-fields", $payload)->assertUnauthorized();

        $fieldReporter = User::factory()->inDistrict($district)->create();
        $this->actingAs($fieldReporter, 'web')
            ->putJson("/api/v1/reports/{$report->uuid}/affected-fields", $payload)
            ->assertForbidden();
    }

    private function storeSurvey(District $district, User $inspector, float $areaSqm = 6075.12): FieldSurvey
    {
        return FieldSurvey::query()->create([
            'client_uuid' => (string) Str::uuid(),
            'inspector_id' => $inspector->id,
            'district_id' => $district->id,
            'polygon' => [
                'type' => 'Polygon',
                'coordinates' => [[
                    [122.95, 10.7], [122.951, 10.7], [122.95, 10.701], [122.95, 10.7],
                ]],
            ],
            'area_sqm' => $areaSqm,
            'captured_at' => '2026-10-04 02:30:12.123456',
        ]);
    }
}
