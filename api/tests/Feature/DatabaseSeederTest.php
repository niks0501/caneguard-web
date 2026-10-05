<?php

namespace Tests\Feature;

use App\Models\Advisory;
use App\Models\District;
use App\Models\DistrictMembership;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\AdvisorDemoSeeder;
use Database\Seeders\DashboardReportSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoAnalyticsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_full_seed_twice_populates_every_dataset_without_changing_counts_or_identities(): void
    {
        Storage::fake('local');
        $this->travelTo(CarbonImmutable::parse('2026-10-05T12:00:00Z'));
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => 'demo-pilot',
        ]);

        $this->seed(DatabaseSeeder::class);
        $reportCount = 12 + count(AdvisorDemoSeeder::reportReferences())
            + count(DashboardReportSeeder::reportReferences()) + DemoAnalyticsSeeder::REPORT_COUNT;
        $this->assertDatabaseCount('users', 3);
        $this->assertDatabaseCount('districts', 1);
        $this->assertDatabaseCount('district_memberships', 2);
        $this->assertDatabaseCount('reports', $reportCount);
        $pilotId = District::query()->where('code', 'demo-pilot')->sole()->id;
        $this->assertSame($reportCount, Report::query()->where('district_id', $pilotId)->count());
        $this->assertSeededDashboardCounts($reportCount);
        $this->assertDatabaseCount('advisories', 4);
        $this->assertDatabaseCount('report_class_scores', $reportCount * count(Report::v2Labels()));
        $this->assertDatabaseCount('report_symptoms', $reportCount);
        $this->assertGreaterThan(0, DB::table('report_quality_warnings')->count());
        $this->assertGreaterThan(0, DB::table('field_validation_assignments')->count());
        $this->assertGreaterThan(0, DB::table('field_validation_completions')->count());

        // The dashboard must select its advisory on the first run, not acquire
        // that dependency only on the second pass.
        $dashboardReferences = DashboardReportSeeder::reportReferences();
        $this->assertGreaterThan(0, Report::query()->whereIn('reference_code', $dashboardReferences)
            ->where('advisory_id', Advisory::query()->where('code', AdvisorDemoSeeder::ADVISORY_CODE)->value('id'))
            ->count());

        $counts = $this->tableCounts();
        $identities = $this->identities();
        $files = Storage::disk('local')->allFiles();
        // Simulate the old seeder output: rerunning must repair stamps in place.
        DB::table('reports')->update(['district_id' => null]);
        $this->seed(DatabaseSeeder::class);

        $this->assertSame($counts, $this->tableCounts());
        $this->assertSame($identities, $this->identities());
        $this->assertSame($files, Storage::disk('local')->allFiles());
        $this->assertSame($reportCount, Report::query()->where('district_id', $pilotId)->count());
        $this->assertSeededDashboardCounts($reportCount);
    }

    public function test_full_seed_preserves_unrelated_rows_and_evidence(): void
    {
        Storage::fake('local');
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => 'demo-pilot',
        ]);
        $user = User::factory()->create();
        $district = District::query()->create(['code' => 'unrelated', 'name' => 'Unrelated district']);
        $membership = DistrictMembership::query()->create(['user_id' => $user->id, 'district_id' => $district->id]);
        $advisory = Advisory::factory()->create();
        $report = Report::factory()->inDistrict($district)->create(['reporter_id' => $user->id, 'advisory_id' => $advisory->id]);
        $assignment = FieldValidationAssignment::factory()->create(['report_id' => $report->id]);
        $completion = FieldValidationCompletion::factory()->create(['assignment_id' => $assignment->id]);
        $models = [$user, $district, $membership, $advisory, $report, $assignment, $completion];
        $rows = array_map(fn ($model) => $model->fresh()->getRawOriginal(), $models);
        $evidence = $this->evidence($report);
        Storage::disk('local')->put($report->image_path, 'unrelated evidence');

        $this->seed(DatabaseSeeder::class);
        $counts = $this->tableCounts();
        $this->seed(DatabaseSeeder::class);

        $this->assertSame($counts, $this->tableCounts());
        foreach ($models as $index => $model) {
            $this->assertSame($rows[$index], $model->fresh()->getRawOriginal());
        }
        $this->assertSame($evidence, $this->evidence($report));
        $this->assertSame('unrelated evidence', Storage::disk('local')->get($report->image_path));
    }

    private function assertSeededDashboardCounts(int $reportCount): void
    {
        // Exercise real seeder stamps and memberships, not test-only certification.
        Sanctum::actingAs(User::query()->where('email', 'mao@caneguard.test')->sole());
        $this->getJson('/api/v1/dashboard/summary?include=counts')
            ->assertOk()
            ->assertJsonPath('data.counts.total_submitted', $reportCount);
        $monthCount = Report::query()
            ->whereBetween('submitted_at', ['2026-09-30 16:00:00', '2026-10-31 15:59:59'])
            ->count();
        $this->assertGreaterThan(0, $monthCount);
        $this->getJson('/api/v1/dashboard/summary?month=2026-10&include=counts,monthly')
            ->assertOk()
            ->assertJsonPath('data.counts.total_submitted', $reportCount)
            ->assertJsonPath('data.monthly_summary.reported_cases', $monthCount);
    }

    private function tableCounts(): array
    {
        $counts = [];
        foreach (Schema::getTableListing() as $table) {
            $counts[$table] = DB::table($table)->count();
        }

        return $counts;
    }

    private function identities(): array
    {
        return [
            'users' => User::query()->orderBy('id')->get(['id', 'uuid', 'email'])->toArray(),
            'reports' => Report::query()->orderBy('id')->get(['id', 'uuid', 'reference_code', 'client_uuid', 'scan_record_client_uuid', 'advisory_id', 'district_id'])->toArray(),
            'assignments' => FieldValidationAssignment::query()->orderBy('id')->get(['id', 'uuid', 'report_id'])->toArray(),
            'completions' => FieldValidationCompletion::query()->orderBy('id')->get(['id', 'uuid', 'client_uuid', 'assignment_id'])->toArray(),
        ];
    }

    private function evidence(Report $report): array
    {
        return [
            DB::table('report_class_scores')->where('report_id', $report->id)->orderBy('label')->get()->map(fn (object $row) => (array) $row)->all(),
            DB::table('report_symptoms')->where('report_id', $report->id)->orderBy('symptom_key')->get()->map(fn (object $row) => (array) $row)->all(),
            DB::table('report_quality_warnings')->where('report_id', $report->id)->orderBy('warning_key')->get()->map(fn (object $row) => (array) $row)->all(),
        ];
    }
}
