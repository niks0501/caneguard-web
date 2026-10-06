<?php

namespace Tests\MySql;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Models\DistrictGrant;
use App\Models\DistrictRecipientSet;
use App\Models\DistrictReportTransmission;
use App\Models\Report;
use App\Models\User;
use App\Notifications\NewCaseSubmittedNotification;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class DistrictAccessMySqlTest extends TestCase
{
    use DatabaseTransactions;

    public function test_mysql_json_hash_scope_and_single_send_intent_survive_reload(): void
    {
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/^firstmate_[a-z0-9_]+$|^caneguard_test$/D', DB::connection()->getDatabaseName());
        config(['caneguard.weekly_send_enabled' => true]);
        $district = $this->pilotDistrict();
        $officer = User::factory()->admin()->inDistrict($district)->create();
        foreach (['report:approve', 'report:send'] as $ability) {
            DistrictGrant::query()->create(['user_id' => $officer->id, 'district_id' => $district->id, 'ability' => $ability]);
        }
        DistrictRecipientSet::query()->create(['district_id' => $district->id, 'recipients' => ['approved@example.test'], 'office_reference' => 'synthetic-office-reference']);
        $pilot = Report::factory()->inDistrict($district)->create(['submitted_at' => '2026-09-29 10:00:00']);
        $unassigned = Report::factory()->create(['submitted_at' => '2026-09-29 10:00:00']);
        $this->actingAs($officer, 'web');
        $this->getJson('/api/v1/reports')->assertOk()->assertJsonFragment(['uuid' => $pilot->uuid])->assertJsonFragment(['uuid' => $unassigned->uuid]);
        $officer->notify(new NewCaseSubmittedNotification($pilot->uuid, $pilot->reference_code));
        $officer->notify(new NewCaseSubmittedNotification($unassigned->uuid, $unassigned->reference_code));
        $this->getJson('/api/v1/notifications')->assertOk()->assertJsonCount(2, 'data');

        $version = $this->postJson('/api/v1/district-reports', ['week' => '2026-W40'])->assertCreated()->json('data');
        $path = '/api/v1/district-reports/'.$version['uuid'];
        $payload = ['content_hash' => $version['content_hash'], 'idempotency_key' => (string) Str::uuid()];
        $this->postJson($path.'/approve', $payload)->assertOk();
        $id = $this->postJson($path.'/send', $payload)->assertStatus(202)->json('data.id');
        $this->postJson($path.'/send', $payload)->assertStatus(202)->assertJsonPath('data.id', $id);
        $this->assertTrue(app(DistrictReportWorkflow::class)->checkPending(DistrictReportTransmission::findOrFail($id)));
        $this->assertDatabaseCount('district_report_transmissions', 1);
        $reviewer = User::factory()->reviewer()->inDistrict($district)->create();
        Auth::forgetGuards();
        $this->actingAs($reviewer, 'web');
        $this->postJson($path.'/send', $payload)->assertForbidden();
        Auth::guard('web')->logout();
        Auth::forgetGuards();
        $farmer = User::factory()->farmer()->create();
        $this->withToken($farmer->createToken('wildcard', ['*'])->plainTextToken)->postJson('/api/v2/mobile/reports', [])->assertForbidden();
    }
}
