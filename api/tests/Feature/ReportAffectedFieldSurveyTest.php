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

    public function test_confirming_without_a_loss_rate_shows_the_phones_percent_and_keeps_stored_history(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->inDistrict($district)->create(['lock_version' => 2]);
        $measured = $this->storeSurvey($district, $inspector, 10000);
        $measured->update(['affected_area_sqm' => 2600]);
        $undrawn = $this->storeSurvey($district, $inspector, 5000);
        $report->affectedFieldSurveys()->attach($undrawn->id, ['loss_rate_percent' => 12.5]);

        $this->actingAs($reviewer, 'web')->putJson(
            "/api/v1/reports/{$report->uuid}/affected-fields",
            [
                'expected_version' => 2,
                'affected_fields' => [
                    ['field_survey_id' => $undrawn->id],
                    ['field_survey_id' => $measured->id],
                ],
            ],
        )->assertOk()
            ->assertJsonPath('data.version', 3)
            ->assertJsonPath('data.affected_fields.0.field_survey_id', $measured->id)
            ->assertJsonPath('data.affected_fields.0.affected_area_sqm', 2600)
            ->assertJsonPath('data.affected_fields.0.affected_percent', 26)
            ->assertJsonPath('data.affected_fields.0.loss_rate_percent', null)
            ->assertJsonPath('data.affected_fields.1.field_survey_id', $undrawn->id)
            ->assertJsonPath('data.affected_fields.1.affected_percent', null)
            ->assertJsonPath('data.affected_fields.1.loss_rate_percent', 12.5);

        // Repeating the same set changes nothing, so the version stays put.
        $this->actingAs($reviewer, 'web')->putJson(
            "/api/v1/reports/{$report->uuid}/affected-fields",
            [
                'expected_version' => 3,
                'affected_fields' => [
                    ['field_survey_id' => $undrawn->id],
                    ['field_survey_id' => $measured->id],
                ],
            ],
        )->assertOk()->assertJsonPath('data.version', 3);
    }

    public function test_case_detail_shows_the_boundary_the_inspector_attached_and_whether_the_office_confirmed_it(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create(['name' => 'Field Inspector']);
        $reviewer = User::factory()->reviewer()->create();
        $survey = $this->storeSurvey($district, $inspector, 5000.5);
        $report = Report::factory()->inDistrict($district)->create([
            'field_survey_client_uuid' => $survey->client_uuid,
        ]);

        $attachment = $this->actingAs($reviewer, 'web')
            ->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->json('data.inspector_attachment');
        $this->assertSame($survey->client_uuid, $attachment['client_uuid']);
        $this->assertTrue($attachment['arrived']);
        $this->assertFalse($attachment['confirmed']);
        $this->assertSame($survey->id, $attachment['field_survey']['field_survey_id']);
        $this->assertSame(5000.5, $attachment['field_survey']['area_sqm']);
        $this->assertSame('Field Inspector', $attachment['field_survey']['inspector']['name']);

        $report->affectedFieldSurveys()->attach($survey->id, ['loss_rate_percent' => 30]);

        $this->actingAs($reviewer, 'web')
            ->getJson("/api/v1/reports/{$report->uuid}")
            ->assertJsonPath('data.inspector_attachment.confirmed', true);
    }

    public function test_an_attachment_whose_boundary_has_not_arrived_is_reported_as_such(): void
    {
        $district = $this->pilotDistrict();
        $reviewer = User::factory()->reviewer()->create();
        $clientUuid = (string) Str::uuid();
        $report = Report::factory()->inDistrict($district)->create(['field_survey_client_uuid' => $clientUuid]);
        $plain = Report::factory()->inDistrict($district)->create();

        $this->actingAs($reviewer, 'web')
            ->getJson("/api/v1/reports/{$report->uuid}")
            ->assertOk()
            ->assertJsonPath('data.inspector_attachment', [
                'client_uuid' => $clientUuid,
                'arrived' => false,
                'confirmed' => false,
                'field_survey' => null,
            ]);
        $this->actingAs($reviewer, 'web')
            ->getJson("/api/v1/reports/{$plain->uuid}")
            ->assertJsonPath('data.inspector_attachment', null);
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

    public function test_percent_is_exposed_only_for_a_measured_affected_area(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create();
        $reviewer = User::factory()->reviewer()->create();
        $attachedUuid = (string) Str::uuid();
        $report = Report::factory()->inDistrict($district)->create([
            'lock_version' => 0,
            'field_survey_client_uuid' => $attachedUuid,
        ]);

        $drawn = $this->storeSurvey($district, $inspector, 12000);
        $drawn->update(['affected_area_sqm' => 3000, 'affected_area_measurement' => 'measured']);
        $plotOnly = $this->storeSurvey($district, $inspector, 12000);
        $plotOnly->update(['affected_area_sqm' => null, 'affected_area_measurement' => 'not_measured']);
        $confirmedZero = $this->storeSurvey($district, $inspector, 12000);
        $confirmedZero->update(['affected_area_sqm' => 0, 'affected_area_measurement' => 'measured', 'affected_area_polygons' => []]);
        // Legacy rows have no flag: an older phone forced 0 onto a plot-only survey.
        $legacyZero = $this->storeSurvey($district, $inspector, 12000);
        $legacyZero->update(['client_uuid' => $attachedUuid, 'affected_area_sqm' => 0, 'affected_area_polygons' => []]);

        $response = $this->actingAs($reviewer, 'web')->putJson("/api/v1/reports/{$report->uuid}/affected-fields", [
            'expected_version' => 0,
            'affected_fields' => collect([$drawn, $plotOnly, $confirmedZero, $legacyZero])
                ->map(fn (FieldSurvey $survey): array => ['field_survey_id' => $survey->id])->all(),
        ])->assertOk();

        $fields = collect($response->json('data.affected_fields'))->keyBy('field_survey_id');
        $this->assertSame(25, $fields[$drawn->id]['affected_percent']);
        $this->assertSame('measured', $fields[$drawn->id]['affected_area_measurement']);
        $this->assertNull($fields[$plotOnly->id]['affected_percent']);
        $this->assertSame('not_measured', $fields[$plotOnly->id]['affected_area_measurement']);
        $this->assertSame(0, $fields[$confirmedZero->id]['affected_percent']);
        $this->assertSame('measured', $fields[$confirmedZero->id]['affected_area_measurement']);
        $this->assertNull($fields[$legacyZero->id]['affected_percent']);
        $this->assertSame('not_measured', $fields[$legacyZero->id]['affected_area_measurement']);

        // The case detail's inspector attachment follows the same rule.
        $this->getJson("/api/v1/reports/{$report->uuid}")->assertOk()
            ->assertJsonPath('data.inspector_attachment.field_survey.affected_percent', null)
            ->assertJsonPath('data.inspector_attachment.field_survey.affected_area_measurement', 'not_measured');
    }

    public function test_small_positive_affected_shares_retain_two_decimals_and_never_round_to_zero(): void
    {
        $district = $this->pilotDistrict();
        $inspector = User::factory()->inDistrict($district)->create();
        $reviewer = User::factory()->reviewer()->create();
        $report = Report::factory()->inDistrict($district)->create(['lock_version' => 0]);

        // 40 m² in 10 ha (100,000 m²) is 0.04% — must not round to 0%.
        $smallPatch = $this->storeSurvey($district, $inspector, 100000);
        $smallPatch->update(['affected_area_sqm' => 40, 'affected_area_measurement' => 'measured']);

        // 1 m² in 10 ha is 0.001% — strictly positive below 0.01%, never 0.
        $tinyPatch = $this->storeSurvey($district, $inspector, 100000);
        $tinyPatch->update(['affected_area_sqm' => 1, 'affected_area_measurement' => 'measured']);

        // 100% whole plot stays 100.
        $wholePlot = $this->storeSurvey($district, $inspector, 100000);
        $wholePlot->update(['affected_area_sqm' => 100000, 'affected_area_measurement' => 'measured']);

        $response = $this->actingAs($reviewer, 'web')->putJson("/api/v1/reports/{$report->uuid}/affected-fields", [
            'expected_version' => 0,
            'affected_fields' => [
                ['field_survey_id' => $smallPatch->id],
                ['field_survey_id' => $tinyPatch->id],
                ['field_survey_id' => $wholePlot->id],
            ],
        ])->assertOk();

        $fields = collect($response->json('data.affected_fields'))->keyBy('field_survey_id');
        $this->assertSame(0.04, $fields[$smallPatch->id]['affected_percent']);
        $this->assertSame(0.001, $fields[$tinyPatch->id]['affected_percent']);
        $this->assertSame(100, $fields[$wholePlot->id]['affected_percent']);
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
