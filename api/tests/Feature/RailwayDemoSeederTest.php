<?php

namespace Tests\Feature;

use App\Models\Advisory;
use App\Models\District;
use App\Models\DistrictMembership;
use App\Models\Report;
use App\Models\User;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Database\Seeders\AdvisorDemoSeeder;
use Database\Seeders\DashboardReportSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\RailwayDemoData;
use Database\Seeders\RailwayDemoSeeder;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class RailwayDemoSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->travelTo(CarbonImmutable::parse('2026-10-06T01:00:00Z'));
        config([
            'caneguard.railway_demo_seed_approval' => RailwayDemoData::APPROVAL,
            'caneguard.pilot_district_code' => 'nasugbu',
            'caneguard.railway_demo_manager_name' => 'Approved synthetic demo manager',
            'caneguard.demo_users.field_reporter_password' => 'Synthetic field test passphrase',
            'caneguard.demo_users.reviewer_password' => 'Synthetic reviewer test passphrase',
            'caneguard.demo_users.admin_password' => 'Synthetic admin test passphrase',
            'caneguard.seeders.dashboard.months_back' => 1,
            'caneguard.seeders.dashboard.reports_per_barangay_per_condition' => 1,
        ]);
    }

    public function test_approved_bootstrap_reuses_admin_membership_only_and_preserves_colliding_legacy_rows(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Crisanto de Vera', 'email' => 'admin@caneguard.test']);
        $legacy = Report::factory()->create([
            'district_id' => null, 'reporter_id' => $admin->id,
            'reference_code' => 'BGO-20260905-0715', 'uuid' => '5e1af3d1-6f7d-4bc2-9e48-2f86a3da0a11',
        ]);
        $legacyAdvisory = Advisory::factory()->create([
            'code' => 'ADV-OFFICE-OPS-001', 'uuid' => '5c21f90a-5a40-4d8d-ae35-1275bb3f0001',
        ]);
        $legacyRows = [$legacy->fresh()->getRawOriginal(), $legacyAdvisory->fresh()->getRawOriginal()];
        Storage::disk('local')->put($legacy->image_path, 'Private legacy evidence must not change');
        $this->seed(RailwayDemoSeeder::class);
        $this->assertSame($legacyRows, [$legacy->fresh()->getRawOriginal(), $legacyAdvisory->fresh()->getRawOriginal()]);
        $this->assertSame('Private legacy evidence must not change', Storage::disk('local')->get($legacy->image_path));
        $district = District::query()->where('code', 'nasugbu')->sole();
        $manager = User::query()->where('email', 'admin@caneguard.test')->sole();
        $this->assertSame($admin->id, $manager->id);
        $this->assertSame(RailwayDemoData::managerName(), $manager->name);
        $this->assertDatabaseHas('district_memberships', ['user_id' => $manager->id, 'district_id' => $district->id, 'revoked_at' => null]);
        $this->assertDatabaseCount('district_grants', 0);
        $this->assertDatabaseCount('district_memberships', 2); // reviewer + manager, no certified inspector roster.
        $this->assertNull(app(DistrictAccess::class)->grant($manager, 'staff:manage', $district->id));
        $expectedCount = 12 + count(AdvisorDemoSeeder::reportReferences()) + count(DashboardReportSeeder::reportReferences()) + 50;
        $this->assertSame($expectedCount, Report::query()->where('district_id', $district->id)->count());
        $this->assertDatabaseCount('railway_demo_seed_runs', 1);
        $this->assertFalse(RailwayDemoData::active());
        $this->actingAs($manager)->getJson('/api/v1/dashboard/summary?include=counts')
            ->assertOk()->assertJsonPath('data.counts.total_submitted', $expectedCount);
        $this->getJson('/api/v1/reports/'.$legacy->uuid)->assertForbidden();
        foreach (['accounts_enabled', 'self_registration_enabled', 'pilot_roster_certified', 'weekly_send_enabled', 'weekly_appendix_enabled'] as $gate) {
            $this->assertFalse((bool) config('caneguard.'.$gate));
        }
    }

    public function test_complete_preexisting_development_fixture_is_not_reattributed_or_overwritten(): void
    {
        config(['caneguard.pilot_district_code' => 'old-demo-pilot']);
        $this->seed(DatabaseSeeder::class);
        DB::table('reports')->update(['district_id' => null]);
        $rows = [];
        foreach (['reports', 'advisories', 'field_validation_assignments', 'field_validation_completions'] as $table) {
            $rows[$table] = DB::table($table)->orderBy('id')->get()->toArray();
        }
        $files = [];
        foreach (Storage::disk('local')->allFiles() as $file) {
            $files[$file] = Storage::disk('local')->get($file);
        }
        config(['caneguard.pilot_district_code' => 'nasugbu']);
        $this->seed(RailwayDemoSeeder::class);
        foreach ($rows as $table => $oldRows) {
            $this->assertEquals($oldRows, DB::table($table)->whereIn('id', array_column($oldRows, 'id'))->orderBy('id')->get()->toArray());
        }
        foreach ($files as $file => $contents) {
            $this->assertSame($contents, Storage::disk('local')->get($file));
        }
        $this->assertSame(count($rows['reports']), Report::query()->whereNull('district_id')->count());
        $this->assertGreaterThan(0, Report::query()->where('district_id', District::query()->where('code', 'nasugbu')->value('id'))->count());
        $this->assertDatabaseCount('district_grants', 0);
    }

    public function test_restart_receipt_does_not_reset_passwords_cases_or_dataset_identities(): void
    {
        $this->seed(RailwayDemoSeeder::class);
        $manager = User::query()->where('email', 'admin@caneguard.test')->sole();
        $before = $manager->getRawOriginal();
        $report = Report::query()->firstOrFail();
        DB::table('reports')->where('id', $report->id)->update(['review_notes' => 'Edited during demonstration']);
        $rows = Report::query()->orderBy('id')->get()->toArray();
        $files = Storage::disk('local')->allFiles();
        config(['caneguard.demo_users.admin_password' => 'A different synthetic restart passphrase']);
        $this->travel(35)->days();
        $this->seed(RailwayDemoSeeder::class);
        $this->assertSame($before, $manager->fresh()->getRawOriginal());
        $this->assertSame($rows, Report::query()->orderBy('id')->get()->toArray());
        $this->assertSame($files, Storage::disk('local')->allFiles());
        $this->assertDatabaseCount('railway_demo_seed_runs', 1);
    }

    public static function rejectedInputs(): array
    {
        return [
            'disabled' => ['caneguard.railway_demo_seed_approval', ''],
            'arbitrary approval' => ['caneguard.railway_demo_seed_approval', 'true'],
            'wrong district' => ['caneguard.pilot_district_code', 'other'],
            'missing manager name' => ['caneguard.railway_demo_manager_name', ''],
            'missing password' => ['caneguard.demo_users.admin_password', null],
            'short password' => ['caneguard.demo_users.reviewer_password', 'short'],
            'accounts open' => ['caneguard.accounts_enabled', true],
            'registration open' => ['caneguard.self_registration_enabled', true],
            'roster open' => ['caneguard.pilot_roster_certified', true],
            'sending open' => ['caneguard.weekly_send_enabled', true],
            'appendix open' => ['caneguard.weekly_appendix_enabled', true],
            'email open' => ['mail.default', 'smtp'],
        ];
    }

    #[DataProvider('rejectedInputs')]
    public function test_unsafe_or_missing_inputs_fail_before_any_seed_mutation(string $key, mixed $value): void
    {
        config([$key => $value]);
        try {
            $this->seed(RailwayDemoSeeder::class);
            $this->fail('Expected bootstrap refusal');
        } catch (LogicException) {
            foreach (['users', 'districts', 'district_memberships', 'district_grants', 'reports', 'railway_demo_seed_runs'] as $table) {
                $this->assertDatabaseCount($table, 0);
            }
            $this->assertSame([], Storage::disk('local')->allFiles());
        }
    }

    public function test_failure_inside_seed_transaction_rolls_back_data_and_receipt(): void
    {
        $interrupted = false;
        DB::listen(function (QueryExecuted $query) use (&$interrupted): void {
            if (! $interrupted && str_starts_with($query->sql, 'insert into "report_class_scores"')) {
                $interrupted = true;
                throw new RuntimeException('Synthetic seeding interruption');
            }
        });
        try {
            $this->seed(RailwayDemoSeeder::class);
            $this->fail('Expected interruption');
        } catch (RuntimeException $error) {
            $this->assertSame('Synthetic seeding interruption', $error->getMessage());
        }
        $this->assertTrue($interrupted);
        foreach (['users', 'districts', 'district_memberships', 'reports', 'railway_demo_seed_runs'] as $table) {
            $this->assertDatabaseCount($table, 0);
        }
        $this->assertFalse(RailwayDemoData::active());
        $this->seed(RailwayDemoSeeder::class);
        $this->assertDatabaseCount('railway_demo_seed_runs', 1);
    }

    public function test_revoked_existing_membership_is_not_silently_reactivated(): void
    {
        $district = District::query()->create(['code' => 'nasugbu', 'name' => 'Nasugbu']);
        $manager = User::factory()->admin()->create(['name' => 'Crisanto de Vera', 'email' => 'admin@caneguard.test']);
        DistrictMembership::query()->create(['user_id' => $manager->id, 'district_id' => $district->id, 'revoked_at' => now()]);
        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('membership-only bootstrap is incomplete');
        $this->seed(RailwayDemoSeeder::class);
    }
}
