<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    public function test_analytics_requires_office_authority_and_a_valid_window(): void
    {
        $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-07')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->fieldReporter()->create());
        $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-07')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->reviewer()->create());
        $this->getJson('/api/v1/reports/analytics?from=2026-09-07&to=2026-09-01')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-07&granularity=month')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        $this->getJson('/api/v1/reports/analytics?from=2025-01-01&to=2026-09-07')
            ->assertUnprocessable()
            ->assertJsonPath('errors.to', ['Custom ranges cannot exceed 366 days.']);

        $this->getJson('/api/v1/reports/analytics?from=2026-01-01&to=2026-09-07&granularity=day')
            ->assertUnprocessable()
            ->assertJsonPath(
                'errors.granularity',
                ['Day buckets are supported for ranges up to 62 days. Use week buckets for longer ranges.'],
            );
    }

    public function test_analytics_buckets_by_pht_day_includes_empty_days_and_excludes_duplicates(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        // 2026-09-01T16:30:00Z is 2026-09-02 in PHT (UTC+8).
        Report::factory()->create([
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'case_state' => Report::CASE_STATE_OPEN,
            'submitted_at' => CarbonImmutable::parse('2026-09-01T16:30:00Z'),
        ]);
        Report::factory()->create([
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_MOSAIC,
            'case_state' => Report::CASE_STATE_CLOSED,
            'submitted_at' => CarbonImmutable::parse('2026-09-02T01:00:00Z'),
        ]);
        $canonical = Report::factory()->create([
            'barangay' => 'Mabini',
            'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
        ]);
        Report::factory()->create([
            'barangay' => 'Mabini',
            'canonical_report_id' => $canonical->getKey(),
            'submitted_at' => CarbonImmutable::parse('2026-09-02T03:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $response = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-03',
            'granularity' => 'day',
        ]));

        $response
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.period.from', '2026-09-01')
            ->assertJsonPath('data.period.to', '2026-09-03')
            ->assertJsonPath('data.period.granularity', 'day')
            ->assertJsonPath('data.period.timezone', 'Asia/Manila')
            ->assertJsonPath('data.period.timezone_label', 'PHT (UTC+8)')
            ->assertJsonPath('data.total_submitted', 3)
            ->assertJsonPath('data.series', [
                ['label' => '2026-09-01', 'count' => 0],
                ['label' => '2026-09-02', 'count' => 3],
                ['label' => '2026-09-03', 'count' => 0],
            ])
            ->assertJsonPath('data.case_state', ['open' => 2, 'closed' => 1]);
    }

    public function test_analytics_buckets_by_iso_week_starting_monday(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        // 2026-09-06 is a Sunday; its ISO week starts Monday 2026-08-31.
        Report::factory()->create([
            'submitted_at' => CarbonImmutable::parse('2026-09-06T02:00:00Z'),
        ]);
        Report::factory()->create([
            'submitted_at' => CarbonImmutable::parse('2026-09-08T02:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-08-31',
            'to' => '2026-09-13',
            'granularity' => 'week',
        ]))
            ->assertOk()
            ->assertJsonPath('data.total_submitted', 2)
            ->assertJsonPath('data.series', [
                ['label' => '2026-08-31', 'count' => 1],
                ['label' => '2026-09-07', 'count' => 1],
            ]);
    }

    public function test_analytics_compares_against_the_previous_equal_window(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        Report::factory()->create([
            'submitted_at' => CarbonImmutable::parse('2026-08-20T02:00:00Z'),
        ]);
        Report::factory()->create([
            'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
        ]);
        Report::factory()->create([
            'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]))
            ->assertOk()
            ->assertJsonPath('data.comparison.previous_from', '2026-08-25')
            ->assertJsonPath('data.comparison.previous_to', '2026-08-31')
            ->assertJsonPath('data.comparison.previous_total', 0)
            ->assertJsonPath('data.comparison.current_total', 2)
            ->assertJsonPath('data.comparison.delta', 2);
    }

    public function test_analytics_applies_the_same_filters_as_the_csv_export(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        Report::factory()->create([
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T02:00:00Z'),
        ]);
        Report::factory()->create([
            'barangay' => 'Poblacion',
            'predicted_label' => Report::LABEL_RUST,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T03:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $query = http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Mabini',
        ]);

        $this->getJson('/api/v1/reports/analytics?'.$query)
            ->assertOk()
            ->assertJsonPath('data.total_submitted', 1)
            ->assertJsonPath('data.cases_by_barangay', [
                ['barangay' => 'Mabini', 'reported_cases' => 1],
            ]);

        $export = $this->get('/api/v1/reports/export?'.http_build_query([
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Mabini',
            'date_from' => '2026-09-01',
            'date_to' => '2026-09-07',
        ]));
        $rows = array_filter(preg_split('/\r\n|\r|\n/', trim($export->streamedContent())) ?: []);
        // Header plus exactly the one matching submitted report.
        $this->assertCount(2, $rows);
    }

    public function test_analytics_returns_an_empty_shape_for_a_quiet_period(): void
    {
        $reviewer = User::factory()->reviewer()->create();

        Sanctum::actingAs($reviewer);

        $response = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-02',
            'granularity' => 'day',
        ]));

        $response
            ->assertOk()
            ->assertJsonPath('data.total_submitted', 0)
            ->assertJsonPath('data.series', [
                ['label' => '2026-09-01', 'count' => 0],
                ['label' => '2026-09-02', 'count' => 0],
            ])
            ->assertJsonPath('data.cases_by_barangay', [])
            ->assertJsonPath('data.cases_by_possible_condition', [])
            ->assertJsonPath('data.case_state', ['open' => 0, 'closed' => 0])
            ->assertJsonPath('data.comparison.delta', 0);

        $payload = json_decode($response->getContent(), false, 512, JSON_THROW_ON_ERROR);
        $this->assertIsObject($payload->data->filters);
        $this->assertSame([], (array) $payload->data->filters);
    }

    public function test_analytics_shares_the_monthly_aggregate_for_mid_month_rows(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        Report::factory()->create([
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'case_state' => Report::CASE_STATE_CLOSED,
            'submitted_at' => CarbonImmutable::parse('2026-09-15T02:00:00Z'),
        ]);
        Report::factory()->create([
            'barangay' => 'Rizal',
            'predicted_label' => Report::LABEL_MOSAIC,
            'case_state' => Report::CASE_STATE_OPEN,
            'submitted_at' => CarbonImmutable::parse('2026-09-16T02:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-30',
            'granularity' => 'week',
        ]))->assertOk()->json('data');

        $monthly = $this->getJson('/api/v1/reports/summary?month=2026-09')
            ->assertOk()->json('data');

        // Mid-month rows sit inside both PHT September periods, so the shared
        // aggregate must agree exactly.
        $this->assertSame($monthly['reported_cases'], $analytics['total_submitted']);
        $this->assertSame($monthly['cases_by_barangay'], $analytics['cases_by_barangay']);
        $this->assertSame(
            $monthly['cases_by_possible_condition'],
            $analytics['cases_by_possible_condition'],
        );
        $this->assertSame($monthly['closed_cases'], $analytics['case_state']['closed']);
    }

    public function test_analytics_reports_reported_concern_beside_the_ai_series(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $rows = [
            ['concern' => Report::REPORTER_CONCERN_RSSI, 'label' => Report::LABEL_MOSAIC],
            ['concern' => Report::LABEL_SMUT, 'label' => Report::LABEL_SMUT],
            ['concern' => 'Red stripe', 'label' => Report::LABEL_HEALTHY],
            ['concern' => null, 'label' => Report::LABEL_RUST],
            ['concern' => ' mosaic ', 'label' => Report::LABEL_MOSAIC],
        ];
        foreach ($rows as $index => $row) {
            Report::factory()->create([
                'reporter_suspected_condition' => $row['concern'],
                'predicted_label' => $row['label'],
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
                'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z')->addHours($index),
            ]);
        }
        Sanctum::actingAs($reviewer);

        $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]))->assertOk()->json('data');

        $this->assertSame(5, $analytics['total_submitted']);
        // Declared order, normalised (' mosaic ' folds into mosaic), tail in
        // `other`, blanks in `not_stated`, totals reconciling with the count.
        $this->assertSame(
            [Report::REPORTER_CONCERN_RSSI, Report::LABEL_SMUT, Report::LABEL_MOSAIC, Report::LABEL_RUST, 'other', 'not_stated'],
            array_column($analytics['reported_concern'], 'concern'),
        );
        $this->assertSame([1, 1, 1, 0, 1, 1], array_column($analytics['reported_concern'], 'count'));
        $this->assertSame(5, array_sum(array_column($analytics['reported_concern'], 'count')));
        $this->assertEqualsWithDelta(1.0, array_sum(array_column($analytics['reported_concern'], 'share')), 0.001);

        // The AI series enumerates the shipped model's declared list only:
        // RSSI never enters it, and smut waits for model integration.
        $this->assertSame(
            [
                ['condition' => Report::LABEL_HEALTHY, 'count' => 1],
                ['condition' => Report::LABEL_MOSAIC, 'count' => 2],
                ['condition' => Report::LABEL_RUST, 'count' => 1],
            ],
            $analytics['possible_condition'],
        );

        $this->assertSame(
            Report::verificationOutcomes(),
            array_keys($analytics['verification_outcome']),
        );
    }

    public function test_analytics_splits_validation_attention_per_barangay_with_nasugbu_scope(): void
    {
        CarbonImmutable::setTestNow('2026-09-10 09:00:00');
        try {
            $reviewer = User::factory()->reviewer()->create();
            $assignee = User::factory()->fieldReporter()->create();
            $past = Report::factory()->create([
                'barangay' => 'Aga',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
            ]);
            FieldValidationAssignment::factory()->create([
                'report_id' => $past->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-09',
            ]);
            $upcoming = Report::factory()->create([
                'barangay' => 'Aga',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z'),
            ]);
            FieldValidationAssignment::factory()->create([
                'report_id' => $upcoming->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-12',
            ]);
            Report::factory()->create([
                'barangay' => 'Banilad',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'submitted_at' => CarbonImmutable::parse('2026-09-04T02:00:00Z'),
            ]);
            Sanctum::actingAs($reviewer);

            $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => '2026-09-01',
                'to' => '2026-09-30',
                'granularity' => 'week',
            ]))->assertOk()->json('data');

            $byBarangay = [];
            foreach ($analytics['validation_by_barangay'] as $row) {
                $byBarangay[$row['barangay']] = $row;
            }
            $this->assertSame(
                ['barangay' => 'Aga', 'submitted' => 2, 'open' => 2, 'past_target_date' => 1, 'scheduled' => 1, 'unscheduled' => 0],
                $byBarangay['Aga'],
            );
            $this->assertSame(
                ['barangay' => 'Banilad', 'submitted' => 1, 'open' => 1, 'past_target_date' => 0, 'scheduled' => 0, 'unscheduled' => 1],
                $byBarangay['Banilad'],
            );

            // Nasugbu scope proof: every scope barangay present, none omitted.
            $this->assertSame('Nasugbu', $analytics['barangay_scope']['municipality']);
            $this->assertSame('Batangas', $analytics['barangay_scope']['province']);
            foreach (['Aga', 'Banilad', 'Bucana'] as $barangay) {
                $this->assertContains($barangay, $analytics['barangay_scope']['barangays']);
                $this->assertArrayHasKey($barangay, $byBarangay);
            }
            $this->assertSame(0, $byBarangay['Bucana']['submitted']);

            // Segments reconcile with the open count per barangay.
            foreach ($byBarangay as $row) {
                $this->assertSame(
                    $row['open'],
                    $row['past_target_date'] + $row['scheduled'] + $row['unscheduled'],
                    $row['barangay'],
                );
            }
        } finally {
            CarbonImmutable::setTestNow();
        }
    }
}
