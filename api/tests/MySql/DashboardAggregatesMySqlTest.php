<?php

namespace Tests\MySql;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Dashboard overhaul P2: the decision aggregates run grouped joins, so
 * they are proven against real MySQL, not only SQLite — PHT bucketing,
 * the declared reported-concern list, the per-barangay validation split,
 * the Nasugbu scope proof, and the quiet-scope shape.
 */
class DashboardAggregatesMySqlTest extends TestCase
{
    use DatabaseTransactions;

    public function test_decision_aggregates_hold_against_mysql(): void
    {
        $this->assertSame('mysql', DB::connection()->getDriverName());
        CarbonImmutable::setTestNow('2026-09-10 09:00:00');
        try {
            $reviewer = User::factory()->reviewer()->create();
            $assignee = User::factory()->fieldReporter()->create();
            $past = Report::factory()->create([
                'barangay' => 'Aga',
                'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
                'predicted_label' => Report::LABEL_MOSAIC,
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
            ]);
            FieldValidationAssignment::factory()->create([
                'report_id' => $past->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-09',
            ]);
            Report::factory()->create([
                'barangay' => 'Banilad',
                'reporter_suspected_condition' => null,
                'predicted_label' => Report::LABEL_HEALTHY,
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
                'case_state' => Report::CASE_STATE_OPEN,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_VERIFIED,
                'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z'),
            ]);
            Sanctum::actingAs($reviewer);

            $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => '2026-09-01',
                'to' => '2026-09-30',
                'granularity' => 'week',
            ]))->assertOk()->json('data');

            $this->assertSame(2, $analytics['total_submitted']);
            $this->assertSame(
                [Report::REPORTER_CONCERN_RSSI, Report::LABEL_SMUT, Report::LABEL_MOSAIC, Report::LABEL_RUST, 'other', 'not_stated'],
                array_column($analytics['reported_concern'], 'concern'),
            );
            $this->assertSame(
                [1, 0, 0, 0, 0, 1],
                array_column($analytics['reported_concern'], 'count'),
            );
            $this->assertSame(
                [
                    ['condition' => Report::LABEL_HEALTHY, 'count' => 1],
                    ['condition' => Report::LABEL_MOSAIC, 'count' => 1],
                    ['condition' => Report::LABEL_RUST, 'count' => 0],
                ],
                $analytics['possible_condition'],
            );
            $this->assertSame(
                ['not_determined' => 1, 'verified' => 1, 'unable_to_verify' => 0],
                $analytics['verification_outcome'],
            );

            $byBarangay = [];
            foreach ($analytics['validation_by_barangay'] as $row) {
                $byBarangay[$row['barangay']] = $row;
            }
            $this->assertSame(
                ['barangay' => 'Aga', 'submitted' => 1, 'open' => 1, 'past_target_date' => 1, 'scheduled' => 0, 'unscheduled' => 0],
                $byBarangay['Aga'],
            );
            $this->assertSame(
                ['barangay' => 'Banilad', 'submitted' => 1, 'open' => 0, 'past_target_date' => 0, 'scheduled' => 0, 'unscheduled' => 0],
                $byBarangay['Banilad'],
            );
            $this->assertSame('Nasugbu', $analytics['barangay_scope']['municipality']);
            $this->assertContains('Aga', $analytics['barangay_scope']['barangays']);
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_decision_aggregates_return_an_empty_shape_for_a_quiet_scope(): void
    {
        $this->assertSame('mysql', DB::connection()->getDriverName());
        Sanctum::actingAs(User::factory()->reviewer()->create());

        $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]))->assertOk()->json('data');

        $this->assertSame(0, $analytics['total_submitted']);
        $this->assertSame(0, array_sum(array_column($analytics['reported_concern'], 'count')));
        $this->assertSame(
            ['not_determined' => 0, 'verified' => 0, 'unable_to_verify' => 0],
            $analytics['verification_outcome'],
        );
        foreach ($analytics['validation_by_barangay'] as $row) {
            $this->assertSame(0, $row['submitted']);
            $this->assertSame(0, $row['open']);
        }
        $this->assertNotEmpty($analytics['barangay_scope']['barangays']);
    }
}
