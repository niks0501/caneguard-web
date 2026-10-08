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
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_full_seed_rerun_preserves_identities_and_repairs_district_stamps(): void
    {
        Storage::fake('local');
        config([
            'caneguard.demo_users.field_reporter_password' => 'field-test-password',
            'caneguard.demo_users.reviewer_password' => 'reviewer-test-password',
            'caneguard.demo_users.admin_password' => 'admin-test-password',
            'caneguard.pilot_district_code' => 'demo-pilot',
        ]);

        CarbonImmutable::setTestNow('2026-10-05T12:00:00Z');
        try {
            $this->seed(DatabaseSeeder::class);
            $pilotId = District::query()->where('code', 'demo-pilot')->sole()->id;
            Sanctum::actingAs(User::query()->where('email', 'mao@caneguard.test')->sole());
            $this->assertDashboardCounts();
            $identities = $this->identities();
            DB::table('reports')->update(['district_id' => null]);

            $this->seed(DatabaseSeeder::class);

            $this->assertSame($identities, $this->identities());
            $this->assertSame(Report::query()->count(), Report::query()->where('district_id', $pilotId)->count());
            $this->assertDashboardCounts();
        } finally {
            CarbonImmutable::setTestNow();
        }
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
        $this->seed(DatabaseSeeder::class);

        foreach ($models as $index => $model) {
            $this->assertSame($rows[$index], $model->fresh()->getRawOriginal());
        }
        $this->assertSame($evidence, $this->evidence($report));
        $this->assertSame('unrelated evidence', Storage::disk('local')->get($report->image_path));
    }

    private function assertDashboardCounts(): void
    {
        $total = Report::query()->count();
        $month = CarbonImmutable::now('Asia/Manila')->format('Y-m');
        $monthCount = Report::query()
            ->whereBetween('submitted_at', [
                CarbonImmutable::now('Asia/Manila')->startOfMonth()->utc(),
                CarbonImmutable::now('Asia/Manila')->endOfMonth()->utc(),
            ])
            ->count();

        $this->getJson('/api/v1/dashboard/summary?include=counts')
            ->assertOk()
            ->assertJsonPath('data.counts.total_submitted', $total);
        $this->getJson('/api/v1/dashboard/summary?month='.$month.'&include=counts,monthly')
            ->assertOk()
            ->assertJsonPath('data.counts.total_submitted', $total)
            ->assertJsonPath('data.monthly_summary.month', $month)
            ->assertJsonPath('data.monthly_summary.reported_cases', $monthCount);
    }

    private function identities(): array
    {
        return [
            'users' => User::query()->orderBy('id')->get(['id', 'uuid', 'email'])->toArray(),
            'reports' => Report::query()->orderBy('id')->get(['id', 'uuid', 'reference_code', 'client_uuid', 'scan_record_client_uuid', 'advisory_id'])->toArray(),
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
